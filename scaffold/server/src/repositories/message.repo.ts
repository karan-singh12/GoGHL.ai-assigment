import { ObjectId, type Filter } from 'mongodb';
import { isDuplicateKeyError } from '../infra/mongo.js';
import type { DeliveryStatus, MessageDoc } from '../types/domain.js';
import { encodeCursor, type Cursor } from '../utils/cursor.js';
import { rankOf } from '../utils/statusRank.js';
import { col } from './collections.js';

export interface InboundInput {
  workspace: string;
  contact: string;
  providerMessageId: string;
  text: string;
  occurredAt: Date;
  eventId?: string;
}

export interface OutboundInput {
  workspace: string;
  contact: string;
  clientRef: string;
  text: string;
  authorSub: string | null;
}

/** Fields that exist only while a send is owed; removed together when it is done. */
const OUTBOX_UNSET = { outboxDueAt: '', outboxOwner: '' } as const;

export const messageRepo = {
  // ------------------------------------------------------------------ inbound

  /**
   * Idempotent: the unique (workspace, providerMessageId) index turns a
   * duplicate webhook into `created: false` instead of a second row.
   */
  async insertInbound(input: InboundInput, now = new Date()): Promise<{ created: boolean; message: MessageDoc }> {
    const doc: MessageDoc = {
      _id: new ObjectId(),
      workspace: input.workspace,
      contact: input.contact,
      dir: 'in',
      text: input.text,
      occurredAt: input.occurredAt,
      createdAt: now,
      providerMessageId: input.providerMessageId,
      eventId: input.eventId,
    };
    try {
      await col.messages().insertOne(doc);
      return { created: true, message: doc };
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      const existing = await col.messages().findOne({ workspace: input.workspace, dir: 'in', providerMessageId: input.providerMessageId });
      if (!existing) throw err;
      return { created: false, message: existing };
    }
  },

  // ----------------------------------------------------------------- outbound

  /**
   * Stores the reply AND its outbox job in one insert (no transaction needed).
   * Idempotent on (workspace, clientRef): concurrent duplicates get the original.
   */
  async insertOutbound(input: OutboundInput, now = new Date()): Promise<{ created: boolean; message: MessageDoc }> {
    const doc: MessageDoc = {
      _id: new ObjectId(),
      workspace: input.workspace,
      contact: input.contact,
      dir: 'out',
      text: input.text,
      occurredAt: now,
      createdAt: now,
      providerMessageId: null,
      clientRef: input.clientRef,
      authorSub: input.authorSub,
      status: 'queued',
      statusRank: rankOf('queued'),
      statusAt: now,
      outboxDueAt: now,
      outboxOwner: null,
      sendAttempts: 0,
      lastSendError: null,
    };
    try {
      await col.messages().insertOne(doc);
      return { created: true, message: doc };
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      const existing = await this.findOutbound(input.workspace, input.clientRef);
      if (!existing) throw err;
      return { created: false, message: existing };
    }
  },

  async findOutbound(workspace: string, clientRef: string): Promise<MessageDoc | null> {
    return col.messages().findOne({ workspace, dir: 'out', clientRef });
  },

  /**
   * Forward-only status. Returns the updated doc, or null when the status is
   * not newer (late/duplicate webhook) or the clientRef is unknown.
   */
  async applyStatus(
    workspace: string,
    clientRef: string,
    status: DeliveryStatus,
    opts: { providerMessageId?: string; now?: Date } = {},
  ): Promise<MessageDoc | null> {
    const now = opts.now ?? new Date();
    const set: Partial<MessageDoc> = { status, statusRank: rankOf(status), statusAt: now };
    if (opts.providerMessageId) set.providerMessageId = opts.providerMessageId;
    return col
      .messages()
      .findOneAndUpdate(
        { workspace, dir: 'out', clientRef, statusRank: { $lt: rankOf(status) } },
        { $set: set },
        { returnDocument: 'after' },
      );
  },

  // ------------------------------------------------------------------- outbox

  /**
   * Lease the next due send. `outboxDueAt` doubles as the lease expiry, so a
   * row held by a crashed instance becomes due again by itself.
   */
  async leaseNextDue(owner: string, leaseMs: number, now = new Date(), excludeWorkspaces: string[] = []): Promise<MessageDoc | null> {
    const filter: Filter<MessageDoc> = { outboxDueAt: { $lte: now } };
    if (excludeWorkspaces.length) filter.workspace = { $nin: excludeWorkspaces };
    return col.messages().findOneAndUpdate(
      filter,
      { $set: { outboxDueAt: new Date(now.getTime() + leaseMs), outboxOwner: owner }, $inc: { sendAttempts: 1 } },
      { sort: { outboxDueAt: 1 }, returnDocument: 'after' },
    );
  },

  /** Pigeon accepted the send. Guarded by owner so a stale worker cannot clobber a newer lease. Status is untouched. */
  async markAccepted(id: ObjectId, owner: string, providerMessageId: string | null, now = new Date()): Promise<boolean> {
    const set: Partial<MessageDoc> = { acceptedAt: now, lastSendError: null };
    if (providerMessageId) set.providerMessageId = providerMessageId;
    const r = await col.messages().updateOne({ _id: id, outboxOwner: owner }, { $set: set, $unset: OUTBOX_UNSET });
    return r.modifiedCount === 1;
  },

  /** Transient failure (429, 503, timeout): try again at `dueAt`. */
  async reschedule(id: ObjectId, owner: string, dueAt: Date, error: string): Promise<boolean> {
    const r = await col
      .messages()
      .updateOne({ _id: id, outboxOwner: owner }, { $set: { outboxDueAt: dueAt, outboxOwner: null, lastSendError: error } });
    return r.modifiedCount === 1;
  },

  /** Permanent failure (4xx other than 429): stop sending, mark failed (forward-only). */
  async markFailed(id: ObjectId, owner: string, error: string, now = new Date()): Promise<MessageDoc | null> {
    return col.messages().findOneAndUpdate(
      { _id: id, outboxOwner: owner },
      {
        $set: { lastSendError: error, status: 'failed', statusRank: rankOf('failed'), statusAt: now },
        $unset: OUTBOX_UNSET,
      },
      { returnDocument: 'after' },
    );
  },

  /** Give back a lease without counting it as an attempt (rate limit said "not yet"). */
  async deferWithoutAttempt(id: ObjectId, owner: string, dueAt: Date): Promise<void> {
    await col
      .messages()
      .updateOne({ _id: id, outboxOwner: owner }, { $set: { outboxDueAt: dueAt, outboxOwner: null }, $inc: { sendAttempts: -1 } });
  },

  /** A status webhook proves the carrier has the message: stop owing a send (no-op if none is pending). */
  async clearOutbox(workspace: string, clientRef: string): Promise<void> {
    await col
      .messages()
      .updateOne({ workspace, dir: 'out', clientRef, outboxDueAt: { $exists: true } }, { $unset: OUTBOX_UNSET });
  },

  async pendingCount(): Promise<number> {
    return col.messages().countDocuments({ outboxDueAt: { $exists: true } });
  },

  // ------------------------------------------------------------------- thread

  /**
   * Latest messages of a conversation, or those strictly older than `before`.
   * Returned oldest first; `prevCursor` points further back in time.
   */
  async thread(
    workspace: string,
    contact: string,
    opts: { before: Cursor | null; limit: number },
  ): Promise<{ items: MessageDoc[]; prevCursor: string | null }> {
    const where: Filter<MessageDoc> = { workspace, contact };
    if (opts.before) {
      where.$or = [{ occurredAt: { $lt: opts.before.t } }, { occurredAt: opts.before.t, _id: { $lt: opts.before.id } }];
    }
    const rows = await col
      .messages()
      .find(where)
      .sort({ occurredAt: -1, _id: -1 })
      .limit(opts.limit + 1)
      .toArray();
    const page = rows.slice(0, opts.limit);
    const oldest = page.at(-1);
    return {
      items: page.reverse(),
      prevCursor: rows.length > opts.limit && oldest ? encodeCursor(oldest.occurredAt, oldest._id) : null,
    };
  },

  // ----------------------------------------------------------------- snapshot

  /** Inbound Pigeon ids grouped by contact, oldest first (the order the UI shows). */
  async inboundIdsByContact(workspace: string): Promise<Map<string, string[]>> {
    const rows = await col
      .messages()
      .find({ workspace, dir: 'in' }, { projection: { _id: 1, contact: 1, providerMessageId: 1, occurredAt: 1 } })
      // occurred_at, then Pigeon's id: the same order Pigeon itself uses, even for equal timestamps
      .sort({ contact: 1, occurredAt: 1, providerMessageId: 1 })
      .toArray();
    const out = new Map<string, string[]>();
    for (const r of rows) {
      if (!r.providerMessageId) continue;
      const list = out.get(r.contact) ?? [];
      list.push(r.providerMessageId);
      out.set(r.contact, list);
    }
    return out;
  },

  async outboundStatuses(workspace: string): Promise<Record<string, DeliveryStatus>> {
    const rows = await col
      .messages()
      .find({ workspace, dir: 'out' }, { projection: { _id: 0, clientRef: 1, status: 1 } })
      .toArray();
    const out: Record<string, DeliveryStatus> = {};
    for (const r of rows) if (r.clientRef && r.status) out[r.clientRef] = r.status;
    return out;
  },

  async workspacesWithData(): Promise<string[]> {
    return col.messages().distinct('workspace');
  },

  async deleteAll(): Promise<void> {
    await col.messages().deleteMany({});
  },
};

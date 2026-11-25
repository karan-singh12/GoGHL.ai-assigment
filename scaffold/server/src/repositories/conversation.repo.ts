import type { Filter } from 'mongodb';
import { isDuplicateKeyError } from '../infra/mongo.js';
import type { ConversationDoc, ConversationState, LastMessagePreview } from '../types/domain.js';
import { beforeFilter, encodeCursor, type Cursor } from '../utils/cursor.js';
import { col } from './collections.js';

export type InboxFilter = 'open' | 'closed' | 'mine' | 'all';

export type ClaimResult =
  | { outcome: 'claimed'; conversation: ConversationDoc }
  | { outcome: 'already'; conversation: ConversationDoc }
  | { outcome: 'taken'; conversation: ConversationDoc };

const PREVIEW_MAX = 140;

/** Upserts can race on the unique (workspace, contact) index; the loser retries once as a plain update. */
async function withUpsertRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
    return fn();
  }
}

export const conversationRepo = {
  async find(workspace: string, contact: string): Promise<ConversationDoc | null> {
    return col.conversations().findOne({ workspace, contact });
  },

  /** Create if missing (open, unassigned). Never changes an existing conversation. */
  async ensure(workspace: string, contact: string, now = new Date()): Promise<ConversationDoc> {
    const doc = await withUpsertRetry(() =>
      col.conversations().findOneAndUpdate(
        { workspace, contact },
        {
          $setOnInsert: {
            workspace,
            contact,
            state: 'open',
            assignee: null,
            assignedAt: null,
            lastActivityAt: now,
            lastMessage: null,
            createdAt: now,
            updatedAt: now,
          },
        },
        { upsert: true, returnDocument: 'after' },
      ),
    );
    if (!doc) throw new Error('conversation upsert returned nothing');
    return doc;
  },

  /**
   * Record activity at `at`. Out-of-order safe: lastActivityAt only grows and
   * the preview only changes for a message at least as new as the current one.
   * `reopen` (inbound messages) moves a closed conversation back to open.
   * Returns the document after the update and whether it was reopened.
   */
  async touch(
    workspace: string,
    contact: string,
    preview: LastMessagePreview,
    opts: { reopen?: boolean; now?: Date } = {},
  ): Promise<{ conversation: ConversationDoc; reopened: boolean }> {
    const now = opts.now ?? new Date();
    const p = { ...preview, text: preview.text.slice(0, PREVIEW_MAX) };
    // Pipeline updates treat strings starting with "$" as field paths. Customer
    // text ("$100 refund?") must never be interpreted, so every value is $literal.
    const lit = (v: unknown) => ({ $literal: v });
    const isNewest = { $gte: [lit(p.at), { $ifNull: ['$lastActivityAt', lit(new Date(0))] }] };

    const before = await withUpsertRetry(() =>
      col.conversations().findOneAndUpdate(
        { workspace, contact },
        [
          {
            $set: {
              workspace: lit(workspace),
              contact: lit(contact),
              state: opts.reopen ? lit('open') : { $ifNull: ['$state', lit('open')] },
              assignee: { $ifNull: ['$assignee', null] },
              assignedAt: { $ifNull: ['$assignedAt', null] },
              createdAt: { $ifNull: ['$createdAt', lit(now)] },
              lastMessage: { $cond: [isNewest, lit(p), { $ifNull: ['$lastMessage', null] }] },
              lastActivityAt: { $max: [{ $ifNull: ['$lastActivityAt', lit(p.at)] }, lit(p.at)] },
              updatedAt: lit(now),
            },
          },
        ],
        { upsert: true, returnDocument: 'before' },
      ),
    );
    const after = await col.conversations().findOne({ workspace, contact });
    if (!after) throw new Error('conversation vanished after touch');
    return { conversation: after, reopened: before?.state === 'closed' && after.state === 'open' };
  },

  /** Atomic claim: exactly one of N concurrent callers wins an unassigned conversation. */
  async claim(workspace: string, contact: string, agent: string, now = new Date()): Promise<ClaimResult> {
    await this.ensure(workspace, contact, now);
    const won = await col
      .conversations()
      .findOneAndUpdate(
        { workspace, contact, assignee: null },
        { $set: { assignee: agent, assignedAt: now, updatedAt: now } },
        { returnDocument: 'after' },
      );
    if (won) return { outcome: 'claimed', conversation: won };

    const current = await this.find(workspace, contact);
    if (!current) throw new Error('conversation vanished during claim');
    return { outcome: current.assignee === agent ? 'already' : 'taken', conversation: current };
  },

  /** Unconditional assignment (admin take-over). Returns the previous assignee. */
  async assign(workspace: string, contact: string, agent: string | null, now = new Date()) {
    await this.ensure(workspace, contact, now);
    const before = await col
      .conversations()
      .findOneAndUpdate(
        { workspace, contact },
        { $set: { assignee: agent, assignedAt: agent ? now : null, updatedAt: now } },
        { returnDocument: 'before' },
      );
    const after = await this.find(workspace, contact);
    return { previous: before?.assignee ?? null, conversation: after! };
  },

  /** Release only if `agent` holds it (pass null to release regardless, admin). */
  async release(workspace: string, contact: string, agent: string | null, now = new Date()) {
    const filter: Filter<ConversationDoc> = agent ? { workspace, contact, assignee: agent } : { workspace, contact };
    return col
      .conversations()
      .findOneAndUpdate(filter, { $set: { assignee: null, assignedAt: null, updatedAt: now } }, { returnDocument: 'after' });
  },

  /** Returns the updated doc, or null if it was already in that state / missing. */
  async setState(workspace: string, contact: string, state: ConversationState, now = new Date()) {
    return col
      .conversations()
      .findOneAndUpdate(
        { workspace, contact, state: { $ne: state } },
        { $set: { state, updatedAt: now } },
        { returnDocument: 'after' },
      );
  },

  /** Inbox page, newest activity first, keyset-paginated. */
  async list(
    workspace: string,
    opts: { filter: InboxFilter; me?: string; cursor: Cursor | null; limit: number },
  ): Promise<{ items: ConversationDoc[]; nextCursor: string | null }> {
    const where: Filter<ConversationDoc> = { workspace };
    if (opts.filter === 'open' || opts.filter === 'closed') where.state = opts.filter;
    if (opts.filter === 'mine') where.assignee = opts.me ?? '__nobody__';
    const query = opts.cursor ? { $and: [where, beforeFilter('lastActivityAt', opts.cursor)] } : where;

    const rows = await col
      .conversations()
      .find(query)
      .sort({ lastActivityAt: -1, _id: -1 })
      .limit(opts.limit + 1)
      .toArray();
    const items = rows.slice(0, opts.limit);
    const last = items.at(-1);
    return { items, nextCursor: rows.length > opts.limit && last ? encodeCursor(last.lastActivityAt, last._id) : null };
  },

  /** Snapshot: every conversation of a workspace (small by nature of the check). */
  async listAll(workspace: string): Promise<Pick<ConversationDoc, 'contact' | 'assignee'>[]> {
    return col
      .conversations()
      .find({ workspace }, { projection: { _id: 0, contact: 1, assignee: 1 } })
      .toArray();
  },

  async workspacesWithData(): Promise<string[]> {
    return col.conversations().distinct('workspace');
  },

  async deleteAll(): Promise<void> {
    await col.conversations().deleteMany({});
  },
};

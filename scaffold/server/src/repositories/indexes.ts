import type { Db, IndexDescription } from 'mongodb';
import { logger } from '../infra/logger.js';
import { COLLECTIONS } from './collections.js';

/**
 * Every index, with the reason it exists in DB_SCHEMA.md. createIndexes is
 * idempotent and safe when several instances boot at once.
 */
export const INDEXES: Record<string, IndexDescription[]> = {
  [COLLECTIONS.conversations]: [
    { key: { workspace: 1, contact: 1 }, name: 'uniq_ws_contact', unique: true },
    { key: { workspace: 1, lastActivityAt: -1, _id: -1 }, name: 'inbox_all' },
    { key: { workspace: 1, state: 1, lastActivityAt: -1, _id: -1 }, name: 'inbox_state' },
    { key: { workspace: 1, assignee: 1, lastActivityAt: -1, _id: -1 }, name: 'inbox_assignee' },
  ],
  [COLLECTIONS.messages]: [
    {
      key: { workspace: 1, providerMessageId: 1 },
      name: 'uniq_inbound_provider_id',
      unique: true,
      partialFilterExpression: { dir: 'in' },
    },
    {
      key: { workspace: 1, clientRef: 1 },
      name: 'uniq_outbound_client_ref',
      unique: true,
      partialFilterExpression: { dir: 'out' },
    },
    { key: { workspace: 1, contact: 1, occurredAt: 1, _id: 1 }, name: 'thread' },
    { key: { outboxDueAt: 1 }, name: 'outbox_due', partialFilterExpression: { outboxDueAt: { $exists: true } } },
  ],
  // The realtime event log lives in Redis Streams (realtime/eventStream.ts), not here.
};

export async function ensureIndexes(db: Db): Promise<void> {
  for (const [collection, specs] of Object.entries(INDEXES)) {
    if (specs.length) await db.collection(collection).createIndexes(specs);
  }
  logger.info('indexes ensured', { collections: Object.keys(INDEXES).length });
}

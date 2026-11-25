import type { Db, IndexDescription } from 'mongodb';
import { logger } from '../infra/logger.js';

/**
 * All indexes, declared next to the collections that own them. Created at boot
 * before /healthz turns green. createIndexes is idempotent and safe to run
 * from several instances at once.
 *
 * The collections and their indexes are filled in after the schema discussion
 * (see ARCHITECTURE.md §5): conversations, messages, events, counters.
 */
export const COLLECTIONS = {
  conversations: 'conversations',
  messages: 'messages',
  events: 'events',
  counters: 'counters',
} as const;

export const INDEXES: Record<string, IndexDescription[]> = {
  // e.g. [COLLECTIONS.conversations]: [{ key: { workspace: 1, contact: 1 }, unique: true, name: 'uniq_ws_contact' }],
};

export async function ensureIndexes(db: Db): Promise<void> {
  for (const [collection, specs] of Object.entries(INDEXES)) {
    if (specs.length) await db.collection(collection).createIndexes(specs);
  }
  logger.info('indexes ensured', { collections: Object.keys(INDEXES).length });
}

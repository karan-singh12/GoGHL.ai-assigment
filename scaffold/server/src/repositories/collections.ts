import type { Collection } from 'mongodb';
import { getDb } from '../infra/mongo.js';
import type { ConversationDoc, MessageDoc } from '../types/domain.js';

export const COLLECTIONS = {
  conversations: 'conversations',
  messages: 'messages',
} as const;

/** Typed collection handles. Only repositories import this file. */
export const col = {
  conversations: (): Collection<ConversationDoc> => getDb().collection<ConversationDoc>(COLLECTIONS.conversations),
  messages: (): Collection<MessageDoc> => getDb().collection<MessageDoc>(COLLECTIONS.messages),
};

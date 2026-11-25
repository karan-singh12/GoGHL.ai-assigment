import type { InboxFilter } from '../domain/types';

// One factory for every cache key, so realtime patches and features agree.
export const qk = {
  me: ['me'] as const,
  workspace: (ws: string) => ['ws', ws] as const,
  conversationsAll: (ws: string) => ['ws', ws, 'conversations'] as const,
  conversations: (ws: string, filter: InboxFilter) => ['ws', ws, 'conversations', filter] as const,
  conversation: (ws: string, contact: string) => ['ws', ws, 'conversation', contact] as const,
  messages: (ws: string, contact: string) => ['ws', ws, 'messages', contact] as const,
};

import type { ConversationDoc, MessageDoc } from '../types/domain.js';

// API shapes (what the React app renders). Documents never leave the server raw.

export const toConversationDto = (c: ConversationDoc) => ({
  contact: c.contact,
  state: c.state,
  assignee: c.assignee,
  lastActivityAt: c.lastActivityAt.toISOString(),
  lastMessage: c.lastMessage ? { text: c.lastMessage.text, dir: c.lastMessage.dir, at: c.lastMessage.at.toISOString() } : null,
});
export type ConversationDto = ReturnType<typeof toConversationDto>;

export const toMessageDto = (m: MessageDoc) => ({
  id: m._id.toHexString(),
  dir: m.dir,
  text: m.text,
  occurredAt: m.occurredAt.toISOString(),
  providerId: m.providerMessageId,
  clientRef: m.clientRef ?? null,
  status: m.status ?? null,
  authorSub: m.authorSub ?? null,
});
export type MessageDto = ReturnType<typeof toMessageDto>;

import { z } from 'zod';
import { PAGINATION } from '../config/constants.js';

const workspace = z.string().min(1).max(128);

export const ListConversationsQuery = z.object({
  workspace,
  filter: z.enum(['open', 'closed', 'mine', 'all']).default('open'),
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(PAGINATION.maxLimit).default(PAGINATION.defaultLimit),
});
export type ListConversationsQuery = z.infer<typeof ListConversationsQuery>;

/** :contact is URL-decoded by Express ("%2B1415…" -> "+1415…"). */
export const ContactParams = z.object({ contact: z.string().min(1).max(64) });

export const WorkspaceQuery = z.object({ workspace });

export const MessagesQuery = z.object({
  workspace,
  before: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(PAGINATION.maxLimit).default(50),
});
export type MessagesQuery = z.infer<typeof MessagesQuery>;

export const ReplyBody = z.object({
  text: z.string().trim().min(1).max(4096),
  /** Idempotency key chosen by the browser before the first attempt. */
  client_ref: z.string().min(8).max(200),
});
export type ReplyBody = z.infer<typeof ReplyBody>;

export const ConversationActionParams = ContactParams.extend({
  action: z.enum(['claim', 'release', 'close', 'reopen']),
});

// Shapes the frontend works with. They mirror the API contract in
// FRONTEND_ARCHITECTURE.md §7 and are the only place those shapes are declared.

export type Role = 'admin' | 'agent';

export interface WorkspaceMembership {
  id: string;
  role: Role;
}

export interface Me {
  sub: string;
  name?: string;
  email?: string;
  workspaces: WorkspaceMembership[];
}

export type ConversationState = 'open' | 'closed';

export interface Conversation {
  contact: string;
  state: ConversationState;
  assignee: string | null;
  lastActivityAt: string;
  lastMessage?: { text: string; dir: MessageDirection; at: string } | null;
}

export type MessageDirection = 'in' | 'out';
export type DeliveryStatus = 'queued' | 'sent' | 'delivered' | 'failed';

export interface Message {
  /** Server id; for an optimistic reply it is `local:<clientRef>` until the server answers. */
  id: string;
  dir: MessageDirection;
  text: string;
  occurredAt: string;
  /** Pigeon message id (inbound) */
  providerId?: string | null;
  /** Our idempotency key (outbound) */
  clientRef?: string | null;
  status?: DeliveryStatus | null;
  authorSub?: string | null;
  /** Client-only: the POST has not been acknowledged yet. */
  pending?: boolean;
  /** Client-only: every POST attempt failed; the user can retry with the same clientRef. */
  submitFailed?: boolean;
}

export type InboxFilter = 'open' | 'mine' | 'closed' | 'all';
export const INBOX_FILTERS: readonly InboxFilter[] = ['open', 'mine', 'closed', 'all'];

export interface Page<T> {
  items: T[];
  nextCursor?: string | null;
  prevCursor?: string | null;
}

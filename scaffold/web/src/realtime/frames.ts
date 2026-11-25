import type { Conversation, ConversationState, DeliveryStatus, Message } from '../domain/types';

// Socket frames (contract F) and the pure translation into cache actions.
// The provider executes the actions; this file decides them, and is tested.

export interface Frame {
  seq: number;
  type: string;
  contact?: string;
  message_id?: string;
  client_ref?: string;
  status?: DeliveryStatus;
  assignee?: string | null;
  state?: ConversationState;
  /** Optional full message, so the UI can render without a refetch. */
  message?: Message;
}

export type FrameAction =
  | { kind: 'upsertMessage'; contact: string; message: Message }
  | { kind: 'invalidateMessages'; contact: string }
  | { kind: 'patchStatus'; contact: string; clientRef: string; status: DeliveryStatus }
  | { kind: 'patchConversation'; contact: string; patch: Partial<Conversation> }
  | { kind: 'refreshList' };

const STATUSES = new Set<DeliveryStatus>(['queued', 'sent', 'delivered', 'failed']);

export function parseFrame(raw: string): Frame | null {
  try {
    const f = JSON.parse(raw) as Partial<Frame>;
    if (!f || typeof f.seq !== 'number' || typeof f.type !== 'string') return null;
    return f as Frame;
  } catch {
    return null;
  }
}

export function frameToActions(f: Frame): FrameAction[] {
  const contact = f.contact;
  switch (f.type) {
    case 'message.inbound':
    case 'message.outbound': {
      if (!contact) return [{ kind: 'refreshList' }];
      const msg: FrameAction = f.message
        ? { kind: 'upsertMessage', contact, message: f.message }
        : { kind: 'invalidateMessages', contact };
      return [msg, { kind: 'refreshList' }];
    }
    case 'message.status': {
      if (!contact || !f.client_ref || !f.status || !STATUSES.has(f.status)) return [];
      return [{ kind: 'patchStatus', contact, clientRef: f.client_ref, status: f.status }];
    }
    case 'conversation.assigned': {
      if (!contact) return [{ kind: 'refreshList' }];
      return [{ kind: 'patchConversation', contact, patch: { assignee: f.assignee ?? null } }, { kind: 'refreshList' }];
    }
    case 'conversation.state': {
      if (!contact || (f.state !== 'open' && f.state !== 'closed')) return [{ kind: 'refreshList' }];
      return [{ kind: 'patchConversation', contact, patch: { state: f.state } }, { kind: 'refreshList' }];
    }
    default:
      // Unknown event types: the server added something; refreshing keeps us correct.
      return [{ kind: 'refreshList' }];
  }
}

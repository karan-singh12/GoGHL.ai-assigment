import { appendEvent } from '../realtime/eventStream.js';
import type { ConversationState, DeliveryStatus, MessageDoc } from '../types/domain.js';
import { newId } from '../utils/ids.js';
import { toMessageDto } from './dto.js';

// Every realtime frame is built here (contract F shapes + extra fields the UI uses).
// Dedupe keys name the FACT, so a retried webhook can never emit it twice.

export const events = {
  inbound: (m: MessageDoc) =>
    appendEvent(m.workspace, `in:${m.providerMessageId}`, {
      type: 'message.inbound',
      contact: m.contact,
      message_id: m.providerMessageId,
      message: toMessageDto(m),
    }),

  outbound: (m: MessageDoc) =>
    appendEvent(m.workspace, `out:${m.clientRef}`, {
      type: 'message.outbound',
      contact: m.contact,
      client_ref: m.clientRef,
      status: m.status,
      message: toMessageDto(m),
    }),

  status: (m: MessageDoc, status: DeliveryStatus) =>
    appendEvent(m.workspace, `st:${m.clientRef}:${status}`, {
      type: 'message.status',
      contact: m.contact,
      client_ref: m.clientRef,
      status,
      message_id: m.providerMessageId,
    }),

  /** Assignments are user actions, never retried by a provider: each one is its own fact. */
  assigned: (workspace: string, contact: string, assignee: string | null) =>
    appendEvent(workspace, `as:${newId('a')}`, { type: 'conversation.assigned', contact, assignee }),

  state: (workspace: string, contact: string, state: ConversationState, factKey = newId('s')) =>
    appendEvent(workspace, `state:${factKey}`, { type: 'conversation.state', contact, state }),
};

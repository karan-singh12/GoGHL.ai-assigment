import { conversationRepo } from '../repositories/conversation.repo.js';
import { messageRepo } from '../repositories/message.repo.js';
import type { DeliveryStatus } from '../types/domain.js';
import { events } from './event.service.js';

// Webhook facts. Every step is idempotent, so a retried (or duplicated)
// webhook simply re-runs them: nothing is stored or emitted twice, and a
// crash between steps is repaired by Pigeon's retry.

export const inboundService = {
  async messageInbound(input: { workspace: string; eventId?: string; messageId: string; from: string; text: string; occurredAt: Date }) {
    const { created, message } = await messageRepo.insertInbound({
      workspace: input.workspace,
      contact: input.from,
      providerMessageId: input.messageId,
      text: input.text,
      occurredAt: input.occurredAt,
      eventId: input.eventId,
    });
    // Reopen only for a NEW message: a late duplicate must not reopen a conversation an agent just closed.
    const { reopened } = await conversationRepo.touch(
      input.workspace,
      input.from,
      { text: message.text, dir: 'in', at: message.occurredAt },
      { reopen: created },
    );
    await events.inbound(message);
    if (reopened) await events.state(input.workspace, input.from, 'open', `reopen:${input.messageId}`);
    return { created };
  },

  /** Forward-only. Unknown client_ref or an older status: ignored (the caller still answers 2xx). */
  async messageStatus(input: { workspace: string; clientRef: string; status: DeliveryStatus; providerMessageId?: string }) {
    // The carrier has the message: no need to keep (re)sending it.
    await messageRepo.clearOutbox(input.workspace, input.clientRef);
    const updated = await messageRepo.applyStatus(input.workspace, input.clientRef, input.status, {
      providerMessageId: input.providerMessageId,
    });
    if (updated) await events.status(updated, input.status);
    return { applied: Boolean(updated) };
  },
};

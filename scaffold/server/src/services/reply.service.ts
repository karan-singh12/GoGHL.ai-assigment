import { isKnownWorkspace } from '../config/env.js';
import { can, type Role } from '../constants/roles.js';
import { conversationRepo } from '../repositories/conversation.repo.js';
import { messageRepo } from '../repositories/message.repo.js';
import type { MessageDoc } from '../types/domain.js';
import { AppError } from '../utils/AppError.js';
import { events } from './event.service.js';

type Nudge = () => void;
let nudgeWorker: Nudge = () => undefined;
/** The outbox worker registers itself so a new reply is sent at once instead of on the next poll. */
export const onReplyQueued = (fn: Nudge) => {
  nudgeWorker = fn;
};

export const replyService = {
  /**
   * Store the reply and its send job in ONE insert, then return: the caller
   * answers 202 only after this resolves ("safely stored"). Idempotent on
   * (workspace, client_ref): the same request twice, even concurrently, is one reply.
   */
  async create(input: { workspace: string; contact: string; text: string; clientRef: string; authorSub: string | null }): Promise<MessageDoc> {
    if (!isKnownWorkspace(input.workspace)) throw new AppError('WORKSPACE_NOT_FOUND');
    const { created, message } = await messageRepo.insertOutbound(input);
    await conversationRepo.touch(input.workspace, input.contact, { text: message.text, dir: 'out', at: message.occurredAt });
    await events.outbound(message);
    if (created) nudgeWorker();
    return message;
  },

  /** UI path: same as above, plus "you cannot reply in a conversation another agent holds" (admins can). */
  async createAsAgent(input: { workspace: string; contact: string; text: string; clientRef: string; sub: string; role: Role }) {
    const existing = await messageRepo.findOutbound(input.workspace, input.clientRef);
    if (existing) return existing; // a retry of a reply we already have: never 409 it
    const conv = await conversationRepo.find(input.workspace, input.contact);
    if (conv?.assignee && conv.assignee !== input.sub && !can(input.role, 'conversation.reassign')) {
      throw new AppError('CONVERSATION_TAKEN');
    }
    return this.create({ ...input, authorSub: input.sub });
  },
};

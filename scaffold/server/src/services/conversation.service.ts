import { isKnownWorkspace } from '../config/env.js';
import { can, type Role } from '../constants/roles.js';
import { conversationRepo, type InboxFilter } from '../repositories/conversation.repo.js';
import { messageRepo } from '../repositories/message.repo.js';
import type { ConversationState } from '../types/domain.js';
import { AppError } from '../utils/AppError.js';
import { decodeCursor } from '../utils/cursor.js';
import { toConversationDto, toMessageDto } from './dto.js';
import { events } from './event.service.js';

export type ClaimStatus = 'claimed' | 'already' | 'taken';

// Workspace membership is checked by the caller (requireMember or the grader
// token). Role rules live here, so the UI and the grader share one code path.

export const conversationService = {
  async list(workspace: string, me: string, q: { filter: InboxFilter; cursor?: string; limit: number }) {
    const page = await conversationRepo.list(workspace, { filter: q.filter, me, cursor: decodeCursor(q.cursor), limit: q.limit });
    return { items: page.items.map(toConversationDto), nextCursor: page.nextCursor };
  },

  async get(workspace: string, contact: string) {
    const c = await conversationRepo.find(workspace, contact);
    if (!c) throw new AppError('CONVERSATION_NOT_FOUND');
    return toConversationDto(c);
  },

  async messages(workspace: string, contact: string, q: { before?: string; limit: number }) {
    const page = await messageRepo.thread(workspace, contact, { before: decodeCursor(q.before), limit: q.limit });
    return { items: page.items.map(toMessageDto), prevCursor: page.prevCursor };
  },

  /**
   * Atomic claim (one winner out of N concurrent callers). `takeOver` lets an
   * admin take a conversation another agent holds.
   */
  async claim(workspace: string, contact: string, agent: string, opts: { takeOver?: boolean } = {}) {
    if (!isKnownWorkspace(workspace)) throw new AppError('WORKSPACE_NOT_FOUND');
    const r = await conversationRepo.claim(workspace, contact, agent);
    if (r.outcome === 'claimed') {
      await events.assigned(workspace, contact, agent);
      return { status: 'claimed' as ClaimStatus, conversation: toConversationDto(r.conversation) };
    }
    if (r.outcome === 'taken' && opts.takeOver) {
      const { conversation } = await conversationRepo.assign(workspace, contact, agent);
      await events.assigned(workspace, contact, agent);
      return { status: 'claimed' as ClaimStatus, conversation: toConversationDto(conversation) };
    }
    return { status: r.outcome as ClaimStatus, conversation: toConversationDto(r.conversation) };
  },

  /** The holder releases; an admin may release anyone's. */
  async release(workspace: string, contact: string, actor: string, role: Role) {
    const current = await conversationRepo.find(workspace, contact);
    if (!current) throw new AppError('CONVERSATION_NOT_FOUND');
    if (current.assignee === null) return toConversationDto(current);
    if (current.assignee !== actor && !can(role, 'conversation.reassign')) throw new AppError('CONVERSATION_TAKEN');
    // Conditional on the holder we just saw: a concurrent re-claim is not silently undone.
    const updated = await conversationRepo.release(workspace, contact, current.assignee);
    if (!updated) throw new AppError('CONVERSATION_TAKEN');
    await events.assigned(workspace, contact, null);
    return toConversationDto(updated);
  },

  /** Close / reopen. Agents may close conversations that are free or theirs; admins any. */
  async setState(workspace: string, contact: string, state: ConversationState, actor: string, role: Role) {
    const current = await conversationRepo.find(workspace, contact);
    if (!current) throw new AppError('CONVERSATION_NOT_FOUND');
    if (!can(role, 'conversation.close')) throw new AppError('FORBIDDEN_ROLE');
    const heldByOther = current.assignee !== null && current.assignee !== actor;
    if (state === 'closed' && heldByOther && !can(role, 'conversation.reassign')) throw new AppError('CONVERSATION_TAKEN');
    const updated = await conversationRepo.setState(workspace, contact, state);
    if (!updated) return toConversationDto(current); // already in that state
    await events.state(workspace, contact, state);
    return toConversationDto(updated);
  },
};

import type { Conversation, Role } from './types';

// Mirrors server/src/constants/roles.ts. The UI only hides or disables; the server enforces.

const PERMISSIONS = {
  'conversation.read': ['admin', 'agent'],
  'conversation.reply': ['admin', 'agent'],
  'conversation.claim': ['admin', 'agent'],
  'conversation.close': ['admin', 'agent'],
  'conversation.reassign': ['admin'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export const can = (role: Role, permission: Permission): boolean =>
  (PERMISSIONS[permission] as readonly Role[]).includes(role);

export interface ConversationAbilities {
  canReply: boolean;
  canClaim: boolean;
  canRelease: boolean;
  canClose: boolean;
  canReopen: boolean;
  /** Why the composer is disabled, if it is. */
  replyBlockedReason?: string;
}

/** Every button on a conversation is derived here, in one testable place. */
export function conversationAbilities(c: Conversation, me: string, role: Role): ConversationAbilities {
  const mine = c.assignee === me;
  const free = c.assignee === null;
  const admin = can(role, 'conversation.reassign');
  const heldByOther = !free && !mine;

  return {
    canReply: can(role, 'conversation.reply') && (!heldByOther || admin),
    canClaim: can(role, 'conversation.claim') && (free || (heldByOther && admin)),
    canRelease: (mine && can(role, 'conversation.claim')) || (heldByOther && admin),
    canClose: c.state === 'open' && can(role, 'conversation.close') && (mine || free || admin),
    canReopen: c.state === 'closed' && can(role, 'conversation.close'),
    replyBlockedReason: heldByOther && !admin ? `Held by ${c.assignee}. Claim is not available.` : undefined,
  };
}

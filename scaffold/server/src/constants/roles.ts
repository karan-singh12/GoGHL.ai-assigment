// Roles come from the IdP `workspaces` claim. Permissions are listed per
// action so a check reads `can(role, 'conversation.reassign')`, not role names.

export const ROLES = ['admin', 'agent'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = {
  'conversation.read': ['admin', 'agent'],
  'conversation.reply': ['admin', 'agent'],
  'conversation.claim': ['admin', 'agent'],
  'conversation.close': ['admin', 'agent'],
  /** Release or take over a conversation held by someone else. */
  'conversation.reassign': ['admin'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export const can = (role: Role, permission: Permission): boolean =>
  (PERMISSIONS[permission] as readonly Role[]).includes(role);

import type { RequestHandler } from 'express';
import { can, type Permission } from '../constants/roles.js';
import type { SessionUser, WorkspaceMembership } from '../types/express.js';
import { AppError } from '../utils/AppError.js';

/** Membership lookup shared with the WebSocket gateway. */
export const membershipOf = (user: SessionUser | undefined, workspace: unknown): WorkspaceMembership | null =>
  typeof workspace === 'string' && user ? (user.workspaces.find((w) => w.id === workspace) ?? null) : null;

/**
 * Tenant gate. Reads ?workspace= (or :workspace), requires the session user to
 * be a member, and sets req.workspace. Must run after requireSession.
 * 401 without a session, 403 for a signed-in non-member (contract E).
 */
export const requireMember: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(new AppError('UNAUTHENTICATED'));
  const ws = req.params.workspace ?? req.query.workspace;
  if (typeof ws !== 'string' || !ws) {
    return next(new AppError('VALIDATION_FAILED', { errors: [{ path: 'workspace', message: 'Required' }] }));
  }
  const membership = membershipOf(req.user, ws);
  if (!membership) return next(new AppError('FORBIDDEN_WORKSPACE'));
  req.workspace = membership;
  next();
};

/** Name used in the brief / reviews; same middleware. */
export const requireWorkspaceMember = requireMember;

/** Role gate by permission name, e.g. requirePermission('conversation.reassign'). Run after requireMember. */
export const requirePermission =
  (permission: Permission): RequestHandler =>
  (req, _res, next) => {
    if (!req.workspace || !can(req.workspace.role, permission)) return next(new AppError('FORBIDDEN_ROLE'));
    next();
  };

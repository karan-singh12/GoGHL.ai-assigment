import type { Role } from '../constants/roles.js';

export interface WorkspaceMembership {
  id: string;
  role: Role;
}

export interface SessionUser {
  sub: string;
  name?: string;
  email?: string;
  workspaces: WorkspaceMembership[];
}

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      /** Set by requireSession. */
      user?: SessionUser;
      /** Set by requireMember: the workspace this request acts on, and the caller's role in it. */
      workspace?: WorkspaceMembership;
      /** Set by the raw-body parser on the webhook route, for HMAC verification. */
      rawBody?: Buffer;
    }
  }
}

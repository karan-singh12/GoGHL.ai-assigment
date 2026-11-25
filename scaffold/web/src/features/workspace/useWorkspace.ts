import { useParams } from 'react-router';
import type { Role } from '../../domain/types';
import { useMe } from '../auth';

export interface WorkspaceContext {
  workspaceId: string;
  role: Role;
  sub: string;
}

/**
 * The current workspace from the URL, and the caller's role in it.
 * Returns null if the user is not a member (the layout shows "no access").
 * Only used below RequireAuth, so `me` is loaded.
 */
export function useWorkspace(): WorkspaceContext | null {
  const { workspaceId = '' } = useParams();
  const me = useMe().data;
  const membership = me?.workspaces.find((w) => w.id === workspaceId);
  if (!me || !membership) return null;
  return { workspaceId, role: membership.role, sub: me.sub };
}

/** Non-null variant for components rendered inside WorkspaceLayout. */
export function useRequiredWorkspace(): WorkspaceContext {
  const ws = useWorkspace();
  if (!ws) throw new Error('useRequiredWorkspace used outside a workspace route');
  return ws;
}

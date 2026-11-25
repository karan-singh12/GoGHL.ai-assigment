import { Navigate } from 'react-router';
import { UI } from '../../constants/uiMessages';
import { EmptyState } from '../../shared/ui/EmptyState';
import { useMe } from '../auth/useMe';

export function RootRedirect() {
  const me = useMe().data;
  const first = me?.workspaces[0];
  if (!first) return <EmptyState title={UI.noAccess} />;
  return <Navigate to={`/w/${encodeURIComponent(first.id)}`} replace />;
}

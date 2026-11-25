import { Navigate } from 'react-router';
import { UI } from '../../constants/uiMessages';
import { Button } from '../../shared/ui/Button';
import { EmptyState } from '../../shared/ui/EmptyState';
import { useLogout, useMe } from '../auth';

export function RootRedirect() {
  const me = useMe().data;
  const logout = useLogout();
  const first = me?.workspaces[0];

  if (!first) {
    // Signed in, but the IdP gave this user no workspace: offer a way out.
    return (
      <div className="center-fill">
        <EmptyState title={UI.noAccess}>
          <Button onClick={() => logout.mutate()} loading={logout.isPending}>
            {UI.signOut}
          </Button>
        </EmptyState>
      </div>
    );
  }
  return <Navigate to={`/w/${encodeURIComponent(first.id)}`} replace />;
}

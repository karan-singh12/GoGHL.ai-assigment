import { Navigate, Outlet, useLocation } from 'react-router';
import { messageFor } from '../../constants/uiMessages';
import { Button } from '../../shared/ui/Button';
import { EmptyState } from '../../shared/ui/EmptyState';
import { FullPageSpinner } from '../../shared/ui/Spinner';
import { useMe } from './useMe';

/** Route guard: renders children only with a session; otherwise sends the user to /login. */
export function RequireAuth() {
  const me = useMe();
  const location = useLocation();

  if (me.isPending) return <FullPageSpinner label="Checking your session" />;
  if (me.isError)
    return (
      <div className="center-fill">
        <EmptyState title={messageFor(me.error)}>
          <Button variant="primary" onClick={() => me.refetch()}>
            Try again
          </Button>
        </EmptyState>
      </div>
    );
  // Remember where the user was (path + filter) so login brings them back there.
  if (!me.data) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}

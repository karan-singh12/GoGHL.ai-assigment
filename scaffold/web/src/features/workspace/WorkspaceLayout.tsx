import { Outlet, useParams } from 'react-router';
import { UI } from '../../constants/uiMessages';
import { RealtimeProvider, useConnectionStatus } from '../../realtime/RealtimeProvider';
import { Button } from '../../shared/ui/Button';
import { ConnectionIndicator } from '../../shared/ui/ConnectionIndicator';
import { EmptyState } from '../../shared/ui/EmptyState';
import { useMe } from '../auth/useMe';
import { useLogout } from '../auth/useLogout';
import { ConversationList } from '../inbox/ConversationList';
import { useWorkspace } from './useWorkspace';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

/** Shell for one workspace: top bar, inbox column, conversation pane, one realtime connection. */
export function WorkspaceLayout() {
  const ws = useWorkspace();
  if (!ws) {
    return (
      <div className="center-fill">
        <EmptyState title={UI.noAccess} />
      </div>
    );
  }
  // key: switching workspace remounts everything below, so no state leaks between tenants.
  return (
    <RealtimeProvider key={ws.workspaceId} workspace={ws.workspaceId}>
      <Shell />
    </RealtimeProvider>
  );
}

function Shell() {
  const me = useMe().data;
  const logout = useLogout();
  const status = useConnectionStatus();
  const { contact } = useParams();

  return (
    <div className="shell" data-has-conversation={contact ? 'true' : 'false'}>
      <header className="topbar">
        <div className="topbar__left">
          <span className="brand" aria-hidden="true">
            ☎
          </span>
          <strong className="topbar__title">{UI.appName}</strong>
          <WorkspaceSwitcher />
        </div>
        <div className="topbar__right">
          <ConnectionIndicator status={status} />
          <span className="topbar__user" title={me?.email}>
            {me?.name ?? me?.sub}
          </span>
          <Button size="sm" variant="ghost" onClick={() => logout.mutate()} loading={logout.isPending}>
            Sign out
          </Button>
        </div>
      </header>
      {status === 'offline' && (
        <div className="banner banner--warn" role="alert">
          You are offline. New messages will appear when the connection is back.
        </div>
      )}
      <aside className="inbox" aria-label="Conversations">
        <ConversationList />
      </aside>
      <main className="pane">
        <Outlet />
      </main>
    </div>
  );
}

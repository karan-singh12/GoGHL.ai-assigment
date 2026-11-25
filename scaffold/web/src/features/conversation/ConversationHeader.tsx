import { Link, useLocation } from 'react-router';
import { conversationAbilities } from '../../domain/permissions';
import type { Conversation, Role } from '../../domain/types';
import { Button } from '../../shared/ui/Button';
import type { ConversationAction } from './api';
import { useConversationActions } from './useConversationActions';

interface Props {
  conversation: Conversation;
  workspace: string;
  sub: string;
  role: Role;
}

export function ConversationHeader({ conversation: c, workspace, sub, role }: Props) {
  const act = useConversationActions(workspace, c.contact);
  const ab = conversationAbilities(c, sub, role);
  const location = useLocation();
  const backTo = `/w/${encodeURIComponent(workspace)}${location.search}`;

  const busy = (a: ConversationAction) => act.isPending && act.variables === a;
  const holder = c.assignee === null ? 'Unassigned' : c.assignee === sub ? 'Assigned to you' : `Assigned to ${c.assignee}`;

  return (
    <header className="convhead">
      <Link to={backTo} className="convhead__back" aria-label="Back to inbox">
        ←
      </Link>
      <div className="convhead__who">
        <h2 className="convhead__contact">{c.contact}</h2>
        <p className="convhead__sub">
          {holder} · {c.state === 'open' ? 'Open' : 'Closed'}
        </p>
      </div>
      <div className="convhead__actions">
        {ab.canClaim && (
          <Button variant="primary" size="sm" onClick={() => act.mutate('claim')} loading={busy('claim')} disabled={act.isPending}>
            {c.assignee && c.assignee !== sub ? 'Take over' : 'Claim'}
          </Button>
        )}
        {ab.canRelease && (
          <Button size="sm" onClick={() => act.mutate('release')} loading={busy('release')} disabled={act.isPending}>
            Release
          </Button>
        )}
        {ab.canClose && (
          <Button size="sm" onClick={() => act.mutate('close')} loading={busy('close')} disabled={act.isPending}>
            Close
          </Button>
        )}
        {ab.canReopen && (
          <Button size="sm" onClick={() => act.mutate('reopen')} loading={busy('reopen')} disabled={act.isPending}>
            Reopen
          </Button>
        )}
      </div>
    </header>
  );
}

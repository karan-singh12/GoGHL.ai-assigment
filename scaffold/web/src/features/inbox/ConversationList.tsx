import clsx from 'clsx';
import { NavLink, useSearchParams } from 'react-router';
import { messageFor, UI } from '../../constants/uiMessages';
import { INBOX_FILTERS, type Conversation, type InboxFilter } from '../../domain/types';
import { relativeTime } from '../../lib/time';
import { Button } from '../../shared/ui/Button';
import { EmptyState } from '../../shared/ui/EmptyState';
import { Spinner } from '../../shared/ui/Spinner';
import { useRequiredWorkspace } from '../workspace/useWorkspace';
import { conversationPath } from './api';
import { InboxFilters } from './InboxFilters';
import { useConversations } from './useConversations';

function parseFilter(v: string | null): InboxFilter {
  return INBOX_FILTERS.includes(v as InboxFilter) ? (v as InboxFilter) : 'open';
}

export function ConversationList() {
  const { workspaceId, sub } = useRequiredWorkspace();
  const [params, setParams] = useSearchParams();
  const filter = parseFilter(params.get('filter'));
  const q = useConversations(workspaceId, filter);

  const setFilter = (f: InboxFilter) =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      if (f === 'open') next.delete('filter');
      else next.set('filter', f);
      return next;
    });

  return (
    <div className="inbox__inner">
      <InboxFilters value={filter} onChange={setFilter} />
      {q.isPending ? (
        <div className="center-pad">
          <Spinner label="Loading conversations" />
        </div>
      ) : q.isError ? (
        <EmptyState title={messageFor(q.error)}>
          <Button size="sm" onClick={() => q.refetch()}>
            Try again
          </Button>
        </EmptyState>
      ) : q.items.length === 0 ? (
        <EmptyState title={UI.emptyInbox} />
      ) : (
        <ul className="convlist">
          {q.items.map((c) => (
            <ConversationRow key={c.contact} c={c} workspace={workspaceId} me={sub} search={params.toString()} />
          ))}
        </ul>
      )}
      {q.hasNextPage && (
        <div className="center-pad">
          <Button size="sm" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>
            {UI.loadMore}
          </Button>
        </div>
      )}
    </div>
  );
}

function ConversationRow({ c, workspace, me, search }: { c: Conversation; workspace: string; me: string; search: string }) {
  const to = conversationPath(workspace, c.contact) + (search ? `?${search}` : '');
  const assignee = c.assignee === null ? 'Unassigned' : c.assignee === me ? 'You' : c.assignee;
  return (
    <li>
      <NavLink to={to} className={({ isActive }) => clsx('convrow', isActive && 'convrow--active')}>
        <div className="convrow__top">
          <span className="convrow__contact">{c.contact}</span>
          <time className="convrow__time" dateTime={c.lastActivityAt}>
            {relativeTime(c.lastActivityAt)}
          </time>
        </div>
        <div className="convrow__preview">
          {c.lastMessage ? (c.lastMessage.dir === 'out' ? 'You: ' : '') + c.lastMessage.text : ' '}
        </div>
        <div className="convrow__meta">
          <span className={clsx('pill', c.assignee === null && 'pill--muted', c.assignee === me && 'pill--accent')}>{assignee}</span>
          {c.state === 'closed' && <span className="pill pill--muted">Closed</span>}
        </div>
      </NavLink>
    </li>
  );
}

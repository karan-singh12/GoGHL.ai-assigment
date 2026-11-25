import { useNavigate } from 'react-router';
import { useMe } from '../auth';
import { useRequiredWorkspace } from './useWorkspace';

const label = (id: string) => id.replace(/^ws_/, '').replace(/^\w/, (c) => c.toUpperCase());

export function WorkspaceSwitcher() {
  const me = useMe().data;
  const { workspaceId, role } = useRequiredWorkspace();
  const navigate = useNavigate();
  const workspaces = me?.workspaces ?? [];

  if (workspaces.length <= 1) {
    return (
      <span className="ws-name">
        {label(workspaceId)} <span className="pill pill--muted">{role}</span>
      </span>
    );
  }

  return (
    <label className="ws-switch">
      <span className="sr-only">Workspace</span>
      <select value={workspaceId} onChange={(e) => navigate(`/w/${encodeURIComponent(e.target.value)}`)}>
        {workspaces.map((w) => (
          <option key={w.id} value={w.id}>
            {label(w.id)} · {w.role}
          </option>
        ))}
      </select>
    </label>
  );
}

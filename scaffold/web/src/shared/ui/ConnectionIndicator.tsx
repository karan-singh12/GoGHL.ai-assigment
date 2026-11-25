import clsx from 'clsx';
import type { ConnectionStatus } from '../../realtime/RealtimeConnection';

const TEXT: Record<ConnectionStatus, string> = {
  connecting: 'Connecting…',
  open: 'Live',
  reconnecting: 'Reconnecting…',
  offline: 'Offline',
  stopped: 'Disconnected',
};

export function ConnectionIndicator({ status }: { status: ConnectionStatus }) {
  return (
    <span className={clsx('conn', `conn--${status}`)} role="status" aria-live="polite">
      <span className="conn__dot" aria-hidden="true" />
      {TEXT[status]}
    </span>
  );
}

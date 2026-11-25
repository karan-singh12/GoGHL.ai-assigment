import clsx from 'clsx';
import type { DeliveryStatus } from '../../domain/types';

const LABEL: Record<DeliveryStatus, string> = {
  queued: 'Queued',
  sent: 'Sent',
  delivered: 'Delivered',
  failed: 'Failed',
};

const ICON: Record<DeliveryStatus, string> = { queued: '◷', sent: '✓', delivered: '✓✓', failed: '!' };

export function StatusBadge({ status }: { status: DeliveryStatus }) {
  return (
    <span className={clsx('status', `status--${status}`)} title={LABEL[status]}>
      <span aria-hidden="true">{ICON[status]}</span> {LABEL[status]}
    </span>
  );
}

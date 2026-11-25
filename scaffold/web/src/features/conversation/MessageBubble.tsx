import clsx from 'clsx';
import { memo } from 'react';
import { UI } from '../../constants/uiMessages';
import type { Message } from '../../domain/types';
import { clockTime } from '../../lib/time';
import { StatusBadge } from '../../shared/ui/StatusBadge';

interface Props {
  m: Message;
  onRetry: (m: Message) => void;
}

export const MessageBubble = memo(function MessageBubble({ m, onRetry }: Props) {
  const out = m.dir === 'out';
  return (
    <li className={clsx('msg', out ? 'msg--out' : 'msg--in', m.pending && 'msg--pending')}>
      <div className="msg__bubble">
        <p className="msg__text">{m.text}</p>
        <div className="msg__meta">
          <time dateTime={m.occurredAt}>{clockTime(m.occurredAt)}</time>
          {out && !m.submitFailed && m.status && <StatusBadge status={m.status} />}
          {out && m.submitFailed && (
            <span className="msg__failed">
              {UI.notSent} ·{' '}
              <button type="button" className="linkbtn" onClick={() => onRetry(m)}>
                {UI.retry}
              </button>
            </span>
          )}
        </div>
      </div>
    </li>
  );
});

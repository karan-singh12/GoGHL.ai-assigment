import { useLayoutEffect, useRef } from 'react';
import { UI } from '../../constants/uiMessages';
import type { Message } from '../../domain/types';
import { Button } from '../../shared/ui/Button';
import { EmptyState } from '../../shared/ui/EmptyState';
import { MessageBubble } from './MessageBubble';

interface Props {
  messages: Message[];
  hasOlder: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  onRetry: (m: Message) => void;
}

const NEAR_BOTTOM_PX = 120;

/** Sticks to the bottom when new messages arrive, unless the agent scrolled up to read history. */
export function MessageList({ messages, hasOlder, loadingOlder, onLoadOlder, onRetry }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const prevHeight = useRef(0);
  const prevFirst = useRef<string | undefined>(undefined);

  const onScroll = () => {
    const el = ref.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  };

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const first = messages[0]?.id;
    if (prevFirst.current && first !== prevFirst.current && !stick.current) {
      // Older messages were prepended: keep the view where it was.
      el.scrollTop += el.scrollHeight - prevHeight.current;
    } else if (stick.current) {
      el.scrollTop = el.scrollHeight;
    }
    prevFirst.current = first;
    prevHeight.current = el.scrollHeight;
  }, [messages]);

  return (
    <div className="thread" ref={ref} onScroll={onScroll}>
      {hasOlder && (
        <div className="center-pad">
          <Button size="sm" variant="ghost" onClick={onLoadOlder} loading={loadingOlder}>
            {UI.loadOlder}
          </Button>
        </div>
      )}
      {messages.length === 0 ? (
        <EmptyState title={UI.emptyThread} />
      ) : (
        <ol className="thread__list" role="log" aria-live="polite" aria-relevant="additions">
          {messages.map((m) => (
            <MessageBubble key={m.clientRef ?? m.providerId ?? m.id} m={m} onRetry={onRetry} />
          ))}
        </ol>
      )}
    </div>
  );
}

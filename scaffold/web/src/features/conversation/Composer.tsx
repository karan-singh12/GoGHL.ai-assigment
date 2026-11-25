import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { UI } from '../../constants/uiMessages';
import { Button } from '../../shared/ui/Button';

const MAX_LEN = 2000;

interface Props {
  onSend: (text: string) => void;
  disabledReason?: string;
}

export function Composer({ onSend, disabledReason }: Props) {
  const [text, setText] = useState('');
  const disabled = Boolean(disabledReason);
  const trimmed = text.trim();

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText(''); // the message is already in the thread (optimistic) and retries on its own
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form className="composer" onSubmit={submit}>
      <label htmlFor="composer-input" className="sr-only">
        Reply
      </label>
      <textarea
        id="composer-input"
        className="composer__input"
        rows={2}
        maxLength={MAX_LEN}
        placeholder={disabledReason ?? UI.composerPlaceholder}
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <Button type="submit" variant="primary" disabled={disabled || !trimmed}>
        Send
      </Button>
    </form>
  );
}

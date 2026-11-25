import clsx from 'clsx';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

type Tone = 'info' | 'success' | 'error';
interface Toast {
  id: number;
  tone: Tone;
  text: string;
}

interface ToastApi {
  show: (text: string, tone?: Tone) => void;
  error: (text: string) => void;
  success: (text: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const TTL_MS = 4_000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const show = useCallback(
    (text: string, tone: Tone = 'info') => {
      const id = nextId.current++;
      setToasts((t) => [...t.filter((x) => x.text !== text).slice(-3), { id, tone, text }]);
      setTimeout(() => dismiss(id), TTL_MS);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({ show, error: (t) => show(t, 'error'), success: (t) => show(t, 'success') }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" role="region" aria-live="polite" aria-label="Notifications">
        {toasts.map((t) => (
          <div key={t.id} className={clsx('toast', `toast--${t.tone}`)} role={t.tone === 'error' ? 'alert' : 'status'}>
            <span>{t.text}</span>
            <button type="button" className="toast__close" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

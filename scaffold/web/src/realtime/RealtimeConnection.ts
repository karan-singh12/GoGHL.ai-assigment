import { session } from '../lib/storage';
import { parseFrame, type Frame } from './frames';

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'offline' | 'stopped';

interface Options {
  workspace: string;
  onFrame: (frame: Frame) => void;
  onStatus: (status: ConnectionStatus) => void;
  /** Called on (re)open. `replayed` is false on a cold start (no lastSeq), so the caller should refetch. */
  onOpen?: (info: { replayed: boolean }) => void;
  /** Called after repeated failures; resolve false if the session is gone, to stop retrying. */
  checkSession?: () => Promise<boolean>;
}

const MIN_DELAY = 500;
const MAX_DELAY = 10_000;

/**
 * One WebSocket per workspace that:
 *  - resumes with ?after=<lastSeq> so nothing is missed across drops or reloads
 *  - ignores frames it has already seen (seq <= lastSeq)
 *  - reconnects with exponential backoff + jitter, immediately when the
 *    browser comes back online or the tab becomes visible
 */
export class RealtimeConnection {
  private ws: WebSocket | null = null;
  private lastSeq: number | null;
  private attempts = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private readonly storageKey: string;

  constructor(private readonly opts: Options) {
    this.storageKey = `sb:lastSeq:${opts.workspace}`;
    const stored = Number(session.get(this.storageKey));
    this.lastSeq = Number.isFinite(stored) && stored > 0 ? stored : null;
  }

  start(): void {
    this.stopped = false;
    window.addEventListener('online', this.wake);
    window.addEventListener('offline', this.markOffline);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    window.removeEventListener('online', this.wake);
    window.removeEventListener('offline', this.markOffline);
    document.removeEventListener('visibilitychange', this.onVisibility);
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const ws = this.ws;
    this.ws = null;
    if (ws && ws.readyState <= WebSocket.OPEN) ws.close(1000, 'client stop');
    this.opts.onStatus('stopped');
  }

  private url(): string {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const qs = new URLSearchParams({ workspace: this.opts.workspace });
    if (this.lastSeq !== null) qs.set('after', String(this.lastSeq));
    return `${proto}://${window.location.host}/ws?${qs}`;
  }

  private connect(): void {
    if (this.stopped) return;
    if (!navigator.onLine) return this.markOffline();
    this.opts.onStatus(this.attempts === 0 ? 'connecting' : 'reconnecting');

    const replayed = this.lastSeq !== null;
    const ws = new WebSocket(this.url());
    this.ws = ws;

    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.attempts = 0;
      this.opts.onStatus('open');
      this.opts.onOpen?.({ replayed });
    };

    ws.onmessage = (ev) => {
      if (this.ws !== ws || typeof ev.data !== 'string') return;
      const frame = parseFrame(ev.data);
      if (!frame) return;
      if (this.lastSeq !== null && frame.seq <= this.lastSeq) return; // already applied
      this.lastSeq = frame.seq;
      session.set(this.storageKey, String(frame.seq));
      this.opts.onFrame(frame);
    };

    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.scheduleReconnect();
    };
    // onerror is always followed by onclose; nothing to do here.
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    this.attempts++;
    this.opts.onStatus(navigator.onLine ? 'reconnecting' : 'offline');

    const base = Math.min(MAX_DELAY, MIN_DELAY * 2 ** (this.attempts - 1));
    const delay = base / 2 + Math.random() * (base / 2);

    this.timer = setTimeout(async () => {
      this.timer = null;
      // A refused upgrade looks like a plain close; after a few, ask whether we are still signed in.
      if (this.attempts >= 3 && this.opts.checkSession && !(await this.opts.checkSession())) return this.stop();
      this.connect();
    }, delay);
  }

  private wake = (): void => {
    if (this.stopped || (this.ws && this.ws.readyState <= WebSocket.OPEN)) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.attempts = 0;
    this.connect();
  };

  private markOffline = (): void => {
    if (!this.stopped) this.opts.onStatus('offline');
  };

  private onVisibility = (): void => {
    if (document.visibilityState === 'visible') this.wake();
  };
}

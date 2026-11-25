// The only place the app talks HTTP. Understands the server envelope
// { success, code, message, data, meta, requestId } and raw contract routes.

export interface FieldError {
  path: string;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly errors?: FieldError[];
  readonly requestId?: string;

  constructor(init: { status: number; code: string; message: string; errors?: FieldError[]; requestId?: string }) {
    super(init.message);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.errors = init.errors;
    this.requestId = init.requestId;
  }

  /** Network failures and 5xx are worth retrying; 4xx are not. */
  get retryable(): boolean {
    return this.status === 0 || this.status >= 500 || this.status === 429;
  }
}

export interface Envelope<T> {
  data: T;
  meta?: Record<string, unknown>;
  code: string;
  message: string;
}

type Query = Record<string, string | number | boolean | null | undefined>;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
}

// Anyone (e.g. the auth feature) can subscribe to "the session is gone".
type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();
export function onUnauthorized(fn: Listener): () => void {
  unauthorizedListeners.add(fn);
  return () => unauthorizedListeners.delete(fn);
}

function buildUrl(path: string, query?: Query): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

async function send(path: string, opts: RequestOptions): Promise<{ res: Response; body: unknown }> {
  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? 'GET',
      credentials: 'include',
      headers: opts.body === undefined ? { accept: 'application/json' } : { accept: 'application/json', 'content-type': 'application/json' },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'Cannot reach the server.' });
  }

  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!res.ok) {
    const b = (body ?? {}) as Partial<{ code: string; message: string; errors: FieldError[]; requestId: string }>;
    if (res.status === 401) unauthorizedListeners.forEach((fn) => fn());
    throw new ApiError({
      status: res.status,
      code: b.code ?? `HTTP_${res.status}`,
      message: b.message ?? res.statusText ?? 'Request failed.',
      errors: b.errors,
      requestId: b.requestId ?? res.headers.get('x-request-id') ?? undefined,
    });
  }
  return { res, body };
}

export const http = {
  /** Envelope routes: returns { data, meta, code, message }. */
  async request<T>(path: string, opts: RequestOptions = {}): Promise<Envelope<T>> {
    const { body } = await send(path, opts);
    const env = (body ?? {}) as Partial<Envelope<T>> & { success?: boolean };
    return { data: env.data as T, meta: env.meta, code: env.code ?? 'OK', message: env.message ?? '' };
  },

  /** Contract routes with a fixed raw shape (e.g. /api/me). */
  async raw<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const { body } = await send(path, opts);
    return body as T;
  },

  get: <T>(path: string, query?: Query, signal?: AbortSignal) => http.request<T>(path, { query, signal }),
  post: <T>(path: string, body?: unknown, query?: Query) => http.request<T>(path, { method: 'POST', body: body ?? {}, query }),
};

export const enc = encodeURIComponent;

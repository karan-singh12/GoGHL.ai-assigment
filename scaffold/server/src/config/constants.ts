// Tunables in one place. Values are chosen against PIGEON.md and harness/check.js.

export const WEBHOOK = Object.freeze({
  /** Signatures older (or further in the future) than this are rejected with 401. */
  toleranceSeconds: 5 * 60,
  bodyLimit: '256kb',
});

export const OUTBOX = Object.freeze({
  /** Pigeon sometimes answers after 12 s; give up earlier and retry with the same Idempotency-Key. */
  sendTimeoutMs: 8_000,
  /** Must exceed sendTimeoutMs so a live worker never loses its lease mid-request. */
  leaseMs: 20_000,
  pollIntervalMs: 250,
  /** Concurrent sends per instance (slow responses must not block the queue). */
  maxInFlight: 8,
  backoffBaseMs: 500,
  backoffMaxMs: 5_000,
  /** After a timeout the send probably went through; the retry is answered from Pigeon's idempotency cache. */
  timeoutRetryMs: 1_000,
});

export const RATE_LIMIT = Object.freeze({
  /** Pigeon: bucket of 8 refilling at 4/s per workspace. Ours is smaller and slower, so we never hit theirs. */
  bucketSize: 6,
  refillPerSecond: 3.5,
  /** Pause the workspace after a 503 so an outage is not hammered (Pigeon counts requests during outages). */
  unavailablePauseMs: 1_000,
  /** Added to Retry-After so clock skew never puts a request inside the window. */
  retryAfterMarginMs: 250,
  defaultRetryAfterMs: 2_000,
});

export const REALTIME = Object.freeze({
  streamMaxLen: 10_000,
  dedupeTtlSeconds: 24 * 60 * 60,
  readBlockMs: 1_000,
  readBatch: 500,
  replayMax: 5_000,
  heartbeatMs: 30_000,
  /** A socket that cannot keep up is closed; the client reconnects with ?after= and loses nothing. */
  maxBufferedBytes: 1_000_000,
});

export const SESSION = Object.freeze({
  cookieName: 'sb_sid',
  /** Binds the OIDC `state` to the browser that started the login (login CSRF). */
  loginCookieName: 'sb_login',
  ttlSeconds: 8 * 60 * 60,
  loginStateTtlSeconds: 10 * 60,
});

export const OIDC = Object.freeze({
  scope: 'openid profile email',
  httpTimeoutMs: 5_000,
  clockToleranceSeconds: 30,
});

export const PAGINATION = Object.freeze({
  defaultLimit: 25,
  maxLimit: 100,
});

/** Every Redis key this app owns starts with this, so reset never touches anything else. */
export const REDIS_PREFIX = 'sb:';

export const SHUTDOWN_TIMEOUT_MS = 5_000;

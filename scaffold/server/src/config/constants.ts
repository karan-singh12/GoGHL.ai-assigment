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
  batchSize: 10,
  backoffBaseMs: 500,
  backoffMaxMs: 5_000,
});

export const RATE_LIMIT = Object.freeze({
  /** Pigeon: bucket of 8 refilling at 4/s per workspace. Stay just under. */
  bucketSize: 8,
  refillPerSecond: 3.5,
  /** Pause after a 503 so an outage is not hammered. */
  unavailablePauseMs: 1_000,
});

export const SESSION = Object.freeze({
  cookieName: 'sb_sid',
  ttlSeconds: 8 * 60 * 60,
  loginStateTtlSeconds: 10 * 60,
});

export const PAGINATION = Object.freeze({
  defaultLimit: 25,
  maxLimit: 100,
});

/** Every Redis key this app owns starts with this, so reset never touches anything else. */
export const REDIS_PREFIX = 'sb:';

export const SHUTDOWN_TIMEOUT_MS = 5_000;

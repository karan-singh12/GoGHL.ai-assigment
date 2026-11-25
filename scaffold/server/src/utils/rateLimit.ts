import { RATE_LIMIT } from '../config/constants.js';
import { getRedis, rkey } from '../infra/redis.js';

// Pigeon's limit is per WORKSPACE, not per instance, so the bucket lives in
// Redis and every instance draws from it. One Lua call checks the cool-off
// (Retry-After / outage pause) and takes a token atomically, using Redis' clock
// so instances with skewed clocks still agree.

const bucketKey = (ws: string) => rkey('rl', ws);
const coolKey = (ws: string) => rkey('cool', ws);

const ACQUIRE_LUA = `
local pttl = redis.call('PTTL', KEYS[2])
if pttl > 0 then return pttl end
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local cap = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local d = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(d[1])
local ts = tonumber(d[2])
if tokens == nil or ts == nil then tokens = cap; ts = now end
tokens = math.min(cap, tokens + math.max(0, now - ts) * rate / 1000)
local wait = 0
if tokens >= 1 then tokens = tokens - 1 else wait = math.ceil((1 - tokens) * 1000 / rate) end
redis.call('HSET', KEYS[1], 'tokens', tostring(tokens), 'ts', tostring(now))
redis.call('PEXPIRE', KEYS[1], 60000)
return wait`;

export const rateLimit = {
  /** 0 = send now (a token was taken). >0 = wait this many ms (nothing taken). */
  async acquire(workspace: string): Promise<number> {
    const wait = await getRedis().eval(ACQUIRE_LUA, 2, bucketKey(workspace), coolKey(workspace), RATE_LIMIT.bucketSize, RATE_LIMIT.refillPerSecond);
    return Number(wait);
  },

  /** Pigeon said 429 + Retry-After: nobody (on any instance) sends for this workspace until it passes. */
  async coolOff(workspace: string, retryAfterMs: number): Promise<number> {
    const ms = Math.max(1, retryAfterMs) + RATE_LIMIT.retryAfterMarginMs;
    await getRedis().set(coolKey(workspace), '429', 'PX', ms);
    return ms;
  },

  /** Short pause after a 503; never shortens an existing (Retry-After) cool-off. */
  async pause(workspace: string, ms = RATE_LIMIT.unavailablePauseMs): Promise<void> {
    await getRedis().set(coolKey(workspace), '503', 'PX', ms, 'NX');
  },
};

/** Retry-After is seconds or an HTTP date. */
export function parseRetryAfter(value: string | null, now = Date.now()): number {
  if (!value) return RATE_LIMIT.defaultRetryAfterMs;
  const secs = Number(value);
  if (Number.isFinite(secs) && secs >= 0) return Math.ceil(secs * 1000);
  const at = Date.parse(value);
  return Number.isNaN(at) ? RATE_LIMIT.defaultRetryAfterMs : Math.max(0, at - now);
}

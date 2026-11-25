import type { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { REALTIME } from '../config/constants.js';
import { logger } from '../infra/logger.js';
import { createBlockingClient, getRedis, rkey } from '../infra/redis.js';

// The realtime event log: one Redis Stream per workspace.
//
// Why a stream and not a Mongo collection + pub/sub: with several instances,
// "allocate seq" and "store event" must be ONE atomic step, otherwise seq 42
// can be stored (and pushed) before 41 and a socket would skip 41. A Lua script
// does dedupe + INCR + XADD atomically, and the entry id IS the seq
// ("<seq>-0"), so stream order == seq order, with no holes from dedupe.
//
// Keys:  sb:seq:<ws>   counter (kept on reset, so seq only ever goes up)
//        sb:ev:<ws>    stream, trimmed to ~REALTIME.streamMaxLen entries
//        sb:dd:<ws>:<k> dedupe marker per fact (24 h)

export interface FrameBody {
  type: string;
  contact: string;
  [field: string]: unknown;
}
export interface Frame extends FrameBody {
  seq: number;
}

const seqKey = (ws: string) => rkey('seq', ws);
export const streamKey = (ws: string) => rkey('ev', ws);
const dedupeKey = (ws: string, k: string) => rkey('dd', ws, k);

const APPEND_LUA = `
if redis.call('SET', KEYS[3], '1', 'NX', 'EX', tonumber(ARGV[3])) == false then return 0 end
local seq = redis.call('INCR', KEYS[1])
local top = redis.call('XREVRANGE', KEYS[2], '+', '-', 'COUNT', 1)
if top[1] then
  local topSeq = tonumber(string.match(top[1][1], '^(%d+)'))
  if topSeq and topSeq >= seq then seq = topSeq + 1; redis.call('SET', KEYS[1], seq) end
end
redis.call('XADD', KEYS[2], 'MAXLEN', '~', tonumber(ARGV[2]), seq .. '-0', 'f', ARGV[1])
return seq`;

/**
 * Append one fact. Returns its seq, or 0 if this dedupe key was already
 * appended (a retried webhook): then nothing is emitted twice.
 */
export async function appendEvent(workspace: string, dedupe: string, body: FrameBody): Promise<number> {
  const seq = await getRedis().eval(
    APPEND_LUA,
    3,
    seqKey(workspace),
    streamKey(workspace),
    dedupeKey(workspace, dedupe),
    JSON.stringify(body),
    REALTIME.streamMaxLen,
    REALTIME.dedupeTtlSeconds,
  );
  return Number(seq);
}

const parseEntry = (id: string, fields: string[]): Frame | null => {
  const i = fields.indexOf('f');
  if (i < 0) return null;
  try {
    return { ...(JSON.parse(fields[i + 1]) as FrameBody), seq: Number.parseInt(id, 10) };
  } catch {
    return null;
  }
};

/** Frames with seq > after, oldest first (replay for GET /ws?after=N). */
export async function framesAfter(workspace: string, after: number, max = REALTIME.replayMax): Promise<Frame[]> {
  const out: Frame[] = [];
  let start = `${after + 1}-0`;
  while (out.length < max) {
    const batch = await getRedis().xrange(streamKey(workspace), start, '+', 'COUNT', 500);
    for (const [id, fields] of batch) {
      const f = parseEntry(id, fields);
      if (f) out.push(f);
    }
    if (batch.length < 500) break;
    start = `${Number.parseInt(batch[batch.length - 1][0], 10) + 1}-0`;
  }
  return out;
}

type Entries = [id: string, fields: string[]][];

/**
 * XREAD replies differ by protocol: RESP2 gives [[key, entries], …], RESP3
 * (ioredis 6 default) gives a map that `call` flattens to [key, entries, key, …].
 * Accept both, so a protocol change cannot silently stop realtime.
 */
export function xreadPairs(reply: unknown): [string, Entries][] {
  if (!Array.isArray(reply) || reply.length === 0) return [];
  if (typeof reply[0] === 'string') {
    const out: [string, Entries][] = [];
    for (let i = 0; i + 1 < reply.length; i += 2) out.push([reply[i] as string, reply[i + 1] as Entries]);
    return out;
  }
  return reply as [string, Entries][];
}

/**
 * Tail every workspace stream on this instance and hand new frames (in seq
 * order, per workspace) to `onFrames`. One blocking connection per instance.
 */
export async function startEventReader(onFrames: (workspace: string, frames: Frame[]) => void): Promise<() => Promise<void>> {
  const workspaces = Object.keys(env.pigeon.apiKeys);
  const redis = getRedis();
  const lastIds: string[] = [];
  for (const ws of workspaces) {
    const top = await redis.xrevrange(streamKey(ws), '+', '-', 'COUNT', 1);
    lastIds.push(top[0]?.[0] ?? '0-0');
  }

  const conn: Redis = await createBlockingClient('xread');
  let running = true;

  const loop = async () => {
    while (running) {
      try {
        const reply = await conn.call(
          'XREAD',
          'COUNT',
          REALTIME.readBatch,
          'BLOCK',
          REALTIME.readBlockMs,
          'STREAMS',
          ...workspaces.map(streamKey),
          ...lastIds,
        );
        for (const [key, entries] of xreadPairs(reply)) {
          const idx = workspaces.findIndex((ws) => streamKey(ws) === key);
          if (idx < 0 || !entries.length) continue;
          lastIds[idx] = entries[entries.length - 1][0];
          const frames = entries.map(([id, fields]) => parseEntry(id, fields)).filter((f): f is Frame => f !== null);
          if (frames.length) onFrames(workspaces[idx], frames);
        }
      } catch (err) {
        if (!running) break;
        logger.warn('event reader error, retrying', { err });
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  };
  const done = loop();

  return async () => {
    running = false;
    conn.disconnect();
    await done;
  };
}

/** Reset: drop streams and dedupe markers, keep seq counters (seq never goes back). */
export const RESETTABLE_PATTERNS = [rkey('ev', '*'), rkey('dd', '*')];

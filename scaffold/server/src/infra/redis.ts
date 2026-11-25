import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { REDIS_PREFIX } from '../config/constants.js';
import { logger } from './logger.js';

// One shared connection for normal commands. Blocking reads (XREAD BLOCK)
// would stall every other command on it, so they get dedicated connections.
let command: Redis | undefined;
const blocking = new Set<Redis>();

function create(name: string): Redis {
  const r = new Redis(env.redisUrl, {
    connectionName: `switchboard-${name}`,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
  });
  r.on('error', (err) => logger.warn('redis error', { conn: name, err }));
  return r;
}

export async function connectRedis(): Promise<Redis> {
  if (command) return command;
  command = create('cmd');
  await command.connect();
  await command.ping();
  logger.info('redis connected');
  return command;
}

export function getRedis(): Redis {
  if (!command) throw new Error('Redis is not connected yet; call connectRedis() during boot');
  return command;
}

/** A dedicated connection for blocking commands (XREAD BLOCK). Closed by closeRedis(). */
export async function createBlockingClient(name: string): Promise<Redis> {
  const r = create(name);
  await r.connect();
  blocking.add(r);
  return r;
}

export async function pingRedis(): Promise<boolean> {
  try {
    return (await getRedis().ping()) === 'PONG';
  } catch {
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  for (const b of blocking) b.disconnect(); // a blocked connection cannot QUIT politely
  blocking.clear();
  await command?.quit().catch(() => undefined);
  command = undefined;
}

/** Builds an app-owned key: rkey('rl', 'ws_acme') -> "sb:rl:ws_acme". */
export const rkey = (...parts: string[]): string => REDIS_PREFIX + parts.join(':');

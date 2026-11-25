import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { REDIS_PREFIX } from '../config/constants.js';
import { logger } from './logger.js';

// Two connections: a connection in SUBSCRIBE mode cannot run normal
// commands, so pub/sub gets its own.
let command: Redis | undefined;
let subscriber: Redis | undefined;

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

/** Lazily opened connection reserved for SUBSCRIBE / PSUBSCRIBE. */
export async function getSubscriber(): Promise<Redis> {
  if (!subscriber) {
    subscriber = create('sub');
    await subscriber.connect();
  }
  return subscriber;
}

export async function pingRedis(): Promise<boolean> {
  try {
    return (await getRedis().ping()) === 'PONG';
  } catch {
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  await Promise.allSettled([command?.quit(), subscriber?.quit()]);
  command = undefined;
  subscriber = undefined;
}

/** Builds an app-owned key: rkey('rl', 'ws_acme') -> "sb:rl:ws_acme". */
export const rkey = (...parts: string[]): string => REDIS_PREFIX + parts.join(':');

import { SHUTDOWN_TIMEOUT_MS } from '../config/constants.js';
import { logger } from './logger.js';

// Readiness + ordered shutdown. Modules register a stop hook when they start;
// hooks run in reverse order (last started, first stopped).

type Hook = { name: string; fn: () => Promise<void> | void };
const hooks: Hook[] = [];
let ready = false;
let stopping = false;

export const isReady = (): boolean => ready && !stopping;
export const markReady = (): void => {
  ready = true;
};

export function onShutdown(name: string, fn: Hook['fn']): void {
  hooks.push({ name, fn });
}

export async function shutdown(reason: string, code = 0): Promise<never> {
  if (stopping) return new Promise<never>(() => {});
  stopping = true;
  logger.info('shutting down', { reason });

  const force = setTimeout(() => {
    logger.error('shutdown timed out, exiting');
    process.exit(code || 1);
  }, SHUTDOWN_TIMEOUT_MS);
  force.unref();

  for (const hook of [...hooks].reverse()) {
    try {
      await hook.fn();
      logger.debug('stopped', { hook: hook.name });
    } catch (err) {
      logger.warn('stop hook failed', { hook: hook.name, err });
    }
  }
  process.exit(code);
}

export function installSignalHandlers(): void {
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (err) => logger.error('unhandled rejection', { err }));
  process.on('uncaughtException', (err) => {
    logger.error('uncaught exception', { err });
    void shutdown('uncaughtException', 1);
  });
}

import { hostname } from 'node:os';
import { randomBytes } from 'node:crypto';

// One id per process. Shows up in every log line and is used as the outbox
// lease owner, so "which copy did this" is always answerable.
export const instanceId = `${hostname()}-${process.pid}-${randomBytes(3).toString('hex')}`;

type Level = 'debug' | 'info' | 'warn' | 'error';
type Fields = Record<string, unknown>;

const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const minLevel = (process.env.LOG_LEVEL as Level) in order ? (process.env.LOG_LEVEL as Level) : 'info';

function serializeError(err: unknown) {
  if (err instanceof Error) return { name: err.name, message: err.message, stack: err.stack };
  return err;
}

function write(level: Level, msg: string, fields?: Fields) {
  if (order[level] < order[minLevel]) return;
  const line: Fields = { t: new Date().toISOString(), level, instance: instanceId, msg, ...fields };
  if (line.err) line.err = serializeError(line.err);
  (level === 'error' || level === 'warn' ? process.stderr : process.stdout).write(JSON.stringify(line) + '\n');
}

export interface Logger {
  debug(msg: string, fields?: Fields): void;
  info(msg: string, fields?: Fields): void;
  warn(msg: string, fields?: Fields): void;
  error(msg: string, fields?: Fields): void;
  child(bound: Fields): Logger;
}

function make(bound: Fields): Logger {
  return {
    debug: (m, f) => write('debug', m, { ...bound, ...f }),
    info: (m, f) => write('info', m, { ...bound, ...f }),
    warn: (m, f) => write('warn', m, { ...bound, ...f }),
    error: (m, f) => write('error', m, { ...bound, ...f }),
    child: (more) => make({ ...bound, ...more }),
  };
}

export const logger = make({});

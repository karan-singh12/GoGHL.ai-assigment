import type { RequestHandler } from 'express';
import { logger } from '../infra/logger.js';

const QUIET = new Set(['/healthz']);

/** One line per request once the response is finished. */
export const requestLogger: RequestHandler = (req, res, next) => {
  if (QUIET.has(req.path)) return next();
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level]('http', {
      reqId: req.requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms: Math.round(ms * 10) / 10,
    });
  });
  next();
};

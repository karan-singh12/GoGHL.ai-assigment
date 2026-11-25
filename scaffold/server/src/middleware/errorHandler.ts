import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { logger } from '../infra/logger.js';
import { isAppError, type FieldError } from '../utils/AppError.js';
import { respond } from '../utils/respond.js';

const zodToFieldErrors = (err: ZodError): FieldError[] =>
  err.issues.map((i) => ({ path: i.path.join('.') || '(root)', message: i.message }));

/** body-parser errors carry a `type` and a `status`. */
interface BodyParserError {
  type?: string;
  status?: number;
}

/**
 * The single place errors become responses. Known errors map to catalog codes.
 * Anything else is logged with its stack and answered as 500 without details.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (res.headersSent) {
    req.socket.destroy();
    return;
  }

  if (isAppError(err)) {
    if (err.status >= 500) logger.error('app error', { reqId: req.requestId, code: err.code, err });
    return respond.fail(res, err.code, { errors: err.errors, message: err.message });
  }

  if (err instanceof ZodError) {
    return respond.fail(res, 'VALIDATION_FAILED', { errors: zodToFieldErrors(err) });
  }

  const bp = err as BodyParserError;
  if (bp?.type === 'entity.parse.failed') {
    return respond.fail(res, 'VALIDATION_FAILED', { errors: [{ path: '(body)', message: 'Malformed JSON' }] });
  }
  if (bp?.type === 'entity.too.large') return respond.fail(res, 'PAYLOAD_TOO_LARGE');

  logger.error('unhandled error', { reqId: req.requestId, method: req.method, path: req.path, err });
  return respond.fail(res, 'INTERNAL_ERROR');
};

import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

export interface ValidationSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

/**
 * Parses body / query / params with zod and replaces them with the parsed
 * (coerced, defaulted, stripped) values. A failure throws the ZodError, which
 * the error middleware turns into 400 VALIDATION_FAILED with field errors.
 *
 *   router.post('/x', validate({ body: ReplySchema }), controller.reply)
 */
export const validate =
  (schemas: ValidationSchemas): RequestHandler =>
  (req, _res, next) => {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params;
      if (schemas.query) req.query = schemas.query.parse(req.query) as typeof req.query;
      if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
      next();
    } catch (err) {
      next(err);
    }
  };

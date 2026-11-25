import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { safeEqual } from '../utils/crypto.js';
import { respond } from '../utils/respond.js';

/** Contract D: /__grader/* needs x-grader-token === GRADER_TOKEN, otherwise 401. */
export const requireGraderToken: RequestHandler = (req, res, next) => {
  const token = req.get('x-grader-token');
  if (!token || !safeEqual(token, env.graderToken)) return respond.status(res, 'INVALID_GRADER_TOKEN');
  next();
};

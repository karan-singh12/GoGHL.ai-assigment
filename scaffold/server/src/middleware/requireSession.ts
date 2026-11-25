import type { RequestHandler } from 'express';
import { SESSION } from '../config/constants.js';
import { sessionService } from '../services/session.service.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/** 401 without a valid session cookie; otherwise sets req.user. */
export const requireSession: RequestHandler = asyncHandler(async (req, _res, next) => {
  const user = await sessionService.get(req.cookies?.[SESSION.cookieName]);
  if (!user) throw new AppError('UNAUTHENTICATED');
  req.user = user;
  next();
});

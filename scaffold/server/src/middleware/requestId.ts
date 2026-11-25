import type { RequestHandler } from 'express';
import { newId } from '../utils/ids.js';

const SAFE = /^[A-Za-z0-9_\-.:]{1,64}$/;

/** Reuses an incoming x-request-id if it looks sane, otherwise makes one, and echoes it back. */
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.get('x-request-id');
  req.requestId = incoming && SAFE.test(incoming) ? incoming : newId('req');
  res.setHeader('x-request-id', req.requestId);
  next();
};

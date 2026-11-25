import express, { type RequestHandler } from 'express';
import { WEBHOOK } from '../config/constants.js';

/**
 * For webhook routes only: keep the exact bytes Pigeon signed. Any content
 * type is accepted, because a forged request may lie about it and must still
 * reach the signature check (and get 401, not 415).
 */
export const rawBody: RequestHandler[] = [
  express.raw({ type: () => true, limit: WEBHOOK.bodyLimit }),
  (req, _res, next) => {
    req.rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    next();
  },
];

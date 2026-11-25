import type { RequestHandler } from 'express';
import { respond } from '../utils/respond.js';

export const notFound: RequestHandler = (_req, res) => {
  respond.fail(res, 'ROUTE_NOT_FOUND');
};

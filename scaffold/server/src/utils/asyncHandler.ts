import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Express 4 does not catch rejected promises; this forwards them to the error middleware. */
export const asyncHandler =
  <Req extends Request = Request>(fn: (req: Req, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req as Req, res, next).catch(next);
  };

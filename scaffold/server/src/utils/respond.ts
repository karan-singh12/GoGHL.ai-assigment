import type { Response } from 'express';
import { MSG, type MsgCode } from '../constants/messages.js';
import type { FieldError } from './AppError.js';

// Two kinds of response:
//  - envelope: every route we design ourselves
//  - raw:      routes whose exact shape is fixed by BRIEF.md / PIGEON.md
//              (/healthz, /api/me, /__grader/*, /webhooks/pigeon)

export interface SuccessEnvelope<T> {
  success: true;
  code: MsgCode;
  message: string;
  data: T;
  meta?: Record<string, unknown>;
  requestId: string;
}

export interface ErrorEnvelope {
  success: false;
  code: MsgCode;
  message: string;
  errors?: FieldError[];
  requestId: string;
}

const requestIdOf = (res: Response): string => res.req?.requestId ?? 'unknown';

export const respond = {
  ok<T>(res: Response, code: MsgCode, data: T, opts: { meta?: Record<string, unknown>; message?: string } = {}) {
    const body: SuccessEnvelope<T> = {
      success: true,
      code,
      message: opts.message ?? MSG[code].message,
      data,
      ...(opts.meta ? { meta: opts.meta } : {}),
      requestId: requestIdOf(res),
    };
    return res.status(MSG[code].status).json(body);
  },

  fail(res: Response, code: MsgCode, opts: { errors?: FieldError[]; message?: string } = {}) {
    const body: ErrorEnvelope = {
      success: false,
      code,
      message: opts.message ?? MSG[code].message,
      ...(opts.errors?.length ? { errors: opts.errors } : {}),
      requestId: requestIdOf(res),
    };
    return res.status(MSG[code].status).json(body);
  },

  /** Contract routes: exact body, no envelope. */
  raw(res: Response, status: number, body: unknown) {
    return res.status(status).json(body);
  },

  /** Contract routes that only need a status code (and a tiny body for humans). */
  status(res: Response, code: MsgCode) {
    return res.status(MSG[code].status).json({ code });
  },
};

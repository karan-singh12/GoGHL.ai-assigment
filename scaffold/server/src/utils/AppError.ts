import { MSG, type MsgCode } from '../constants/messages.js';

export interface FieldError {
  path: string;
  message: string;
}

/**
 * The only error type services throw on purpose. The error middleware turns it
 * into the response envelope, using the status and message from the catalog.
 *
 *   throw new AppError('CONVERSATION_TAKEN');
 *   throw new AppError('VALIDATION_FAILED', { errors: [{ path: 'text', message: 'Required' }] });
 */
export class AppError extends Error {
  readonly code: MsgCode;
  readonly status: number;
  readonly errors?: FieldError[];
  readonly data?: unknown;

  constructor(code: MsgCode, opts: { message?: string; errors?: FieldError[]; data?: unknown; cause?: unknown } = {}) {
    super(opts.message ?? MSG[code].message, { cause: opts.cause });
    this.name = 'AppError';
    this.code = code;
    this.status = MSG[code].status;
    this.errors = opts.errors;
    this.data = opts.data;
  }
}

export const isAppError = (err: unknown): err is AppError => err instanceof AppError;

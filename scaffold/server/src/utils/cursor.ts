import { ObjectId } from 'mongodb';
import { AppError } from './AppError.js';

// Keyset pagination cursor: (timestamp, _id) encoded as base64url JSON.
// Opaque to clients, stable under inserts (no skip/offset drift).

export interface Cursor {
  t: Date;
  id: ObjectId;
}

export function encodeCursor(t: Date, id: ObjectId): string {
  return Buffer.from(JSON.stringify({ t: t.getTime(), id: id.toHexString() })).toString('base64url');
}

/** Throws VALIDATION_FAILED for anything malformed, so a bad cursor is a 400, never a 500. */
export function decodeCursor(raw: string | undefined | null): Cursor | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as { t?: unknown; id?: unknown };
    if (typeof v.t !== 'number' || !Number.isFinite(v.t) || typeof v.id !== 'string' || !ObjectId.isValid(v.id)) throw new Error();
    return { t: new Date(v.t), id: new ObjectId(v.id) };
  } catch {
    throw new AppError('VALIDATION_FAILED', { errors: [{ path: 'cursor', message: 'Invalid cursor' }] });
  }
}

/** Mongo filter for "strictly before (t, id)" in a (field desc, _id desc) ordering. */
export const beforeFilter = (field: string, c: Cursor) => ({
  $or: [{ [field]: { $lt: c.t } }, { [field]: c.t, _id: { $lt: c.id } }],
});

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Constant-time string comparison; false for different lengths without leaking timing on content. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

export const sha256 = (input: string | Buffer): Buffer => createHash('sha256').update(input).digest();

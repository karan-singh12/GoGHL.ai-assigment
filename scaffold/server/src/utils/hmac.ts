import { createHmac, timingSafeEqual } from 'node:crypto';

export type SignatureVerdict = 'ok' | 'invalid' | 'stale';

/**
 * Pigeon: `x-pigeon-signature: t=<unix seconds>,v1=<hex>` where v1 =
 * HMAC-SHA256("<t>.<raw body>", secret). Pure function (tested).
 *  - missing / malformed / mismatching signature -> 'invalid' (401)
 *  - valid signature but |now - t| > tolerance  -> 'stale'   (401, replay)
 * Several v1 values are allowed (secret rotation): any match is enough.
 */
export function verifyPigeonSignature(
  rawBody: Buffer,
  header: string | undefined,
  secret: string,
  nowSeconds: number,
  toleranceSeconds: number,
): SignatureVerdict {
  if (!header || header.length > 1024) return 'invalid';
  let t: number | null = null;
  const v1: string[] = [];
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === 't' && /^\d{1,12}$/.test(v)) t = Number(v);
    else if (k === 'v1' && /^[0-9a-fA-F]{64}$/.test(v)) v1.push(v.toLowerCase());
  }
  if (t === null || v1.length === 0) return 'invalid';

  const expected = createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest();
  const matches = v1.some((sig) => timingSafeEqual(Buffer.from(sig, 'hex'), expected));
  if (!matches) return 'invalid';

  // Checked after the signature, so a forged request never learns about timing rules.
  return Math.abs(nowSeconds - t) > toleranceSeconds ? 'stale' : 'ok';
}

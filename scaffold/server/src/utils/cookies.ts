import type { CookieOptions } from 'express';
import { env } from '../config/env.js';

/**
 * Secure everywhere except localhost. Decided from the public callback host,
 * NOT from NODE_ENV: the check runs NODE_ENV=production over http://localhost,
 * where a Secure cookie would be silently dropped and login would break.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const secure = !LOCAL_HOSTS.has(new URL(env.oidc.redirectUri).hostname);

export const sessionCookieOptions = (maxAgeSeconds: number): CookieOptions => ({
  httpOnly: true,
  sameSite: 'lax', // sent on the top-level redirect back from the IdP, not on cross-site POSTs
  secure,
  path: '/',
  maxAge: maxAgeSeconds * 1000,
});

export const loginCookieOptions = (maxAgeSeconds: number): CookieOptions => ({
  httpOnly: true,
  sameSite: 'lax',
  secure,
  path: '/auth',
  maxAge: maxAgeSeconds * 1000,
});

/** Minimal Cookie header parser for places without Express (WebSocket upgrade). */
export function parseCookieHeader(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (!k || k in out) continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

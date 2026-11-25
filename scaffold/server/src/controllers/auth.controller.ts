import type { Request, Response } from 'express';
import type { z } from 'zod';
import { SESSION } from '../config/constants.js';
import { MSG, type MsgCode } from '../constants/messages.js';
import { env } from '../config/env.js';
import { logger } from '../infra/logger.js';
import { authService } from '../services/auth.service.js';
import { sessionService } from '../services/session.service.js';
import { isAppError } from '../utils/AppError.js';
import { loginCookieOptions, sessionCookieOptions } from '../utils/cookies.js';
import { safeEqual } from '../utils/crypto.js';
import { respond } from '../utils/respond.js';
import type { CallbackQuery, LoginQuery } from '../validators/auth.schema.js';

/** Where the browser lands after login/logout: the React app (WEB_ORIGIN). */
const appUrl = (path = '/') => new URL(path, env.webOrigin).toString();

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Static page for a failed login (status is still 400/401/503). No user input is echoed. */
const loginFailedPage = (message: string, back: string) =>
  `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="3;url=${escapeHtml(back)}">` +
  `<title>Sign-in failed</title><body style="font:16px system-ui;max-width:480px;margin:80px auto">` +
  `<h1 style="font-size:20px">Sign-in failed</h1><p>${escapeHtml(message)}</p>` +
  `<p><a href="${escapeHtml(back)}">Back to sign in</a></p></body>`;

export const authController = {
  /** GET /auth/login → 302 to the IdP (contract E). */
  async login(req: Request, res: Response) {
    const { returnTo } = req.query as z.infer<typeof LoginQuery>;
    const { url, state } = await authService.startLogin(returnTo);
    res.cookie(SESSION.loginCookieName, state, loginCookieOptions(SESSION.loginStateTtlSeconds));
    res.redirect(302, url);
  },

  /**
   * GET /auth/callback → verify, create session, set cookie, 302 to the app.
   * Any failure is a real 400/401 (or 503 if the IdP is down). Browsers get a
   * tiny page that links back to the login screen; other clients get the envelope.
   */
  async callback(req: Request, res: Response) {
    const q = req.query as z.infer<typeof CallbackQuery>;
    res.clearCookie(SESSION.loginCookieName, loginCookieOptions(0));

    const fail = (code: MsgCode) => {
      const back = appUrl(`/login?error=${encodeURIComponent(code)}`);
      res.status(MSG[code].status);
      res.format({
        json: () => respond.fail(res, code),
        html: () => res.send(loginFailedPage(MSG[code].message, back)),
        default: () => respond.fail(res, code),
      });
    };

    if (q.error || !q.code || !q.state) {
      logger.warn('oidc callback without code', { error: q.error, desc: q.error_description });
      return fail('LOGIN_DENIED');
    }
    // Login CSRF: the state must belong to the browser that started this login.
    const bound = req.cookies?.[SESSION.loginCookieName];
    if (typeof bound !== 'string' || !safeEqual(bound, q.state)) return fail('LOGIN_STATE_INVALID');

    try {
      const { user, returnTo } = await authService.finishLogin(q.code, q.state);
      // Rotate: drop any previous session in this browser (session fixation).
      await sessionService.destroy(req.cookies?.[SESSION.cookieName]);
      const sid = await sessionService.create(user);
      res.cookie(SESSION.cookieName, sid, sessionCookieOptions(SESSION.ttlSeconds));
      logger.info('login', { sub: user.sub, workspaces: user.workspaces.map((w) => w.id) });
      return res.redirect(302, appUrl(returnTo ?? '/'));
    } catch (err) {
      if (isAppError(err)) return fail(err.code);
      throw err;
    }
  },

  /** POST /auth/logout → destroy the server session and clear the cookie. */
  async logout(req: Request, res: Response) {
    await sessionService.destroy(req.cookies?.[SESSION.cookieName]);
    res.clearCookie(SESSION.cookieName, sessionCookieOptions(0));
    return respond.ok(res, 'LOGGED_OUT', null);
  },
};

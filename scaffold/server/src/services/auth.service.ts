import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { z } from 'zod';
import { OIDC, SESSION } from '../config/constants.js';
import { env } from '../config/env.js';
import { getRedis, rkey } from '../infra/redis.js';
import { logger } from '../infra/logger.js';
import type { SessionUser } from '../types/express.js';
import { AppError } from '../utils/AppError.js';
import { randomToken, sha256 } from '../utils/crypto.js';
import { DiscoveryDoc, IdTokenClaims, PendingLogin, TokenResponse } from '../validators/auth.schema.js';

// OpenID Connect, authorization code + PKCE (S256), done on the server.
// The browser never sees tokens; it only gets an httpOnly session cookie.

type Discovery = z.infer<typeof DiscoveryDoc>;

let discoveryPromise: Promise<{ doc: Discovery; jwks: JWTVerifyGetKey }> | null = null;

/** Fetched once and cached; a failure is not cached so the next login retries. */
function discovery() {
  discoveryPromise ??= (async () => {
    const url = `${env.oidc.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
    const res = await fetch(url, { signal: AbortSignal.timeout(OIDC.httpTimeoutMs) });
    if (!res.ok) throw new Error(`discovery answered ${res.status}`);
    const doc = DiscoveryDoc.parse(await res.json());
    return { doc, jwks: createRemoteJWKSet(new URL(doc.jwks_uri)) };
  })().catch((err) => {
    discoveryPromise = null;
    logger.warn('oidc discovery failed', { err });
    throw new AppError('IDP_UNAVAILABLE', { cause: err });
  });
  return discoveryPromise;
}

const pendingKey = (state: string) => rkey('oidc', state);

export const authService = {
  /**
   * Step 1: build the IdP redirect. PKCE verifier + nonce are stored in Redis
   * (not memory) because the callback may land on another instance.
   */
  async startLogin(returnTo?: string): Promise<{ url: string; state: string }> {
    const { doc } = await discovery();
    const state = randomToken(24);
    const nonce = randomToken(24);
    const verifier = randomToken(48); // 64 chars, within RFC 7636's 43–128
    const challenge = sha256(verifier).toString('base64url');

    const pending: PendingLogin = { verifier, nonce, returnTo };
    await getRedis().set(pendingKey(state), JSON.stringify(pending), 'EX', SESSION.loginStateTtlSeconds);

    const url = new URL(doc.authorization_endpoint);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: env.oidc.clientId,
      redirect_uri: env.oidc.redirectUri,
      scope: OIDC.scope,
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    }).toString();
    return { url: url.toString(), state };
  },

  /** Step 2: single-use state → code exchange → verify id_token → session user. */
  async finishLogin(code: string, state: string): Promise<{ user: SessionUser; returnTo?: string }> {
    const raw = await getRedis().getdel(pendingKey(state)); // single use: a replayed callback fails
    if (!raw) throw new AppError('LOGIN_STATE_INVALID');
    const pending = PendingLogin.parse(JSON.parse(raw));
    const { doc, jwks } = await discovery();

    let tokenRes: Response;
    try {
      tokenRes = await fetch(doc.token_endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
          authorization: 'Basic ' + Buffer.from(`${encodeURIComponent(env.oidc.clientId)}:${encodeURIComponent(env.oidc.clientSecret)}`).toString('base64'),
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: env.oidc.redirectUri,
          code_verifier: pending.verifier,
        }),
        signal: AbortSignal.timeout(OIDC.httpTimeoutMs),
      });
    } catch (err) {
      throw new AppError('IDP_UNAVAILABLE', { cause: err });
    }
    if (!tokenRes.ok) {
      logger.warn('oidc token exchange rejected', { status: tokenRes.status, body: (await tokenRes.text()).slice(0, 200) });
      throw new AppError('LOGIN_FAILED');
    }

    const tokens = TokenResponse.parse(await tokenRes.json());
    let claims: z.infer<typeof IdTokenClaims>;
    try {
      const { payload } = await jwtVerify(tokens.id_token, jwks, {
        issuer: doc.issuer,
        audience: env.oidc.clientId,
        algorithms: ['RS256'],
        clockTolerance: OIDC.clockToleranceSeconds,
      });
      claims = IdTokenClaims.parse(payload);
    } catch (err) {
      logger.warn('id_token rejected', { err });
      throw new AppError('LOGIN_FAILED', { cause: err });
    }
    if (claims.nonce !== pending.nonce) throw new AppError('LOGIN_FAILED', { message: 'Nonce mismatch.' });

    return {
      user: { sub: claims.sub, name: claims.name, email: claims.email, workspaces: claims.workspaces },
      returnTo: pending.returnTo,
    };
  },
};

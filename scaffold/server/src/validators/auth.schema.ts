import { z } from 'zod';
import { ROLES } from '../constants/roles.js';

/** Only same-site relative paths: "/w/ws_acme". Blocks open redirects ("//evil.com", "https://…"). */
export const SafeReturnTo = z
  .string()
  .max(512)
  .refine((v) => v.startsWith('/') && !v.startsWith('//') && !v.includes('\\'), 'Must be a relative path');

export const LoginQuery = z.object({
  returnTo: SafeReturnTo.optional().catch(undefined),
});

export const CallbackQuery = z.object({
  code: z.string().min(1).max(2048).optional(),
  state: z.string().min(1).max(256).optional(),
  error: z.string().max(256).optional(),
  error_description: z.string().max(1024).optional(),
});

/** OIDC discovery document: only the fields we use. */
export const DiscoveryDoc = z.object({
  issuer: z.string().url(),
  authorization_endpoint: z.string().url(),
  token_endpoint: z.string().url(),
  jwks_uri: z.string().url(),
});

export const TokenResponse = z.object({
  id_token: z.string().min(1),
  access_token: z.string().optional(),
  token_type: z.string().optional(),
});

/** Custom claim: [{ id, role }]. Unknown roles are dropped, not trusted. */
export const WorkspacesClaim = z
  .array(z.object({ id: z.string().min(1).max(128), role: z.string() }))
  .transform((list) =>
    list
      .filter((w): w is { id: string; role: (typeof ROLES)[number] } => (ROLES as readonly string[]).includes(w.role))
      .map(({ id, role }) => ({ id, role })),
  );

export const IdTokenClaims = z.object({
  sub: z.string().min(1),
  nonce: z.string().optional(),
  name: z.string().optional(),
  email: z.string().optional(),
  workspaces: WorkspacesClaim.default([]),
});

/** Stored in Redis under sb:oidc:<state> between /auth/login and /auth/callback. */
export const PendingLogin = z.object({
  verifier: z.string(),
  nonce: z.string(),
  returnTo: z.string().optional(),
});
export type PendingLogin = z.infer<typeof PendingLogin>;

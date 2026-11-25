import { z } from 'zod';

// Every setting comes from the environment (contract B). Defaults match
// .env.example so a clean clone runs with no .env file. If <repo>/.env
// exists it is loaded first; real environment variables still win.
try {
  process.loadEnvFile(new URL('../../../../.env', import.meta.url));
} catch {
  // no .env file: defaults apply
}

const url = z.string().url();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: url.default('http://localhost:5173'),
  GRADER_TOKEN: z.string().min(1).default('grader-dev-token'),

  MONGO_URL: z.string().min(1).default('mongodb://localhost:27017/switchboard'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  ELASTICSEARCH_URL: url.default('http://localhost:9200'),

  PIGEON_URL: url.default('http://localhost:4010'),
  PIGEON_WEBHOOK_SECRET: z.string().min(1).default('whsec_pigeon_dev'),
  PIGEON_KEY_WS_ACME: z.string().min(1).default('pk_acme_7d1f0a'),
  PIGEON_KEY_WS_GLOBEX: z.string().min(1).default('pk_globex_c93b22'),

  OIDC_ISSUER: url.default('http://localhost:4020'),
  OIDC_CLIENT_ID: z.string().min(1).default('switchboard-web'),
  OIDC_CLIENT_SECRET: z.string().min(1).default('dev-secret-not-for-production'),
  OIDC_REDIRECT_URI: url.default('http://localhost:4000/auth/callback'),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  // Fail fast with a readable message instead of a confusing runtime error later.
  const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
  console.error(`Invalid environment configuration:\n${lines.join('\n')}`);
  process.exit(1);
}
const e = parsed.data;

// Workspaces are whatever PIGEON_KEY_WS_<NAME> variables exist:
// PIGEON_KEY_WS_ACME -> ws_acme. Adding a workspace needs no code change.
function collectPigeonKeys(): Record<string, string> {
  const keys: Record<string, string> = {
    ws_acme: e.PIGEON_KEY_WS_ACME,
    ws_globex: e.PIGEON_KEY_WS_GLOBEX,
  };
  for (const [name, value] of Object.entries(process.env)) {
    const m = /^PIGEON_KEY_(WS_[A-Z0-9_]+)$/.exec(name);
    if (m && value) keys[m[1].toLowerCase()] = value;
  }
  return keys;
}

export const env = Object.freeze({
  nodeEnv: e.NODE_ENV,
  isProd: e.NODE_ENV === 'production',
  port: e.PORT,
  webOrigin: e.WEB_ORIGIN,
  graderToken: e.GRADER_TOKEN,
  mongoUrl: e.MONGO_URL,
  redisUrl: e.REDIS_URL,
  elasticsearchUrl: e.ELASTICSEARCH_URL,
  pigeon: Object.freeze({
    url: e.PIGEON_URL,
    webhookSecret: e.PIGEON_WEBHOOK_SECRET,
    apiKeys: Object.freeze(collectPigeonKeys()),
  }),
  oidc: Object.freeze({
    issuer: e.OIDC_ISSUER,
    clientId: e.OIDC_CLIENT_ID,
    clientSecret: e.OIDC_CLIENT_SECRET,
    redirectUri: e.OIDC_REDIRECT_URI,
  }),
});

export const isKnownWorkspace = (ws: string): boolean => Object.hasOwn(env.pigeon.apiKeys, ws);

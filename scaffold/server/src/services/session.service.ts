import { z } from 'zod';
import { SESSION } from '../config/constants.js';
import { ROLES } from '../constants/roles.js';
import { getRedis, rkey } from '../infra/redis.js';
import type { SessionUser } from '../types/express.js';
import { randomToken, sha256 } from '../utils/crypto.js';

// Server-side sessions in Redis, shared by every instance. The cookie holds a
// random id; Redis stores only its SHA-256, so a Redis dump does not contain
// usable cookies.

const SessionUserSchema = z.object({
  sub: z.string(),
  name: z.string().optional(),
  email: z.string().optional(),
  workspaces: z.array(z.object({ id: z.string(), role: z.enum(ROLES) })),
});

const keyFor = (sessionId: string) => rkey('sess', sha256(sessionId).toString('base64url'));

export const sessionService = {
  async create(user: SessionUser): Promise<string> {
    const id = randomToken(32);
    await getRedis().set(keyFor(id), JSON.stringify(user), 'EX', SESSION.ttlSeconds);
    return id;
  },

  /** Sliding expiry: every authenticated request extends the session. */
  async get(sessionId: string | undefined): Promise<SessionUser | null> {
    if (!sessionId || sessionId.length > 128) return null;
    const raw = await getRedis().getex(keyFor(sessionId), 'EX', SESSION.ttlSeconds);
    if (!raw) return null;
    try {
      return SessionUserSchema.parse(JSON.parse(raw));
    } catch {
      return null;
    }
  },

  async destroy(sessionId: string | undefined): Promise<void> {
    if (sessionId) await getRedis().del(keyFor(sessionId));
  },
};

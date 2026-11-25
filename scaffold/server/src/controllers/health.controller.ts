import type { Request, Response } from 'express';
import { isReady } from '../infra/lifecycle.js';
import { instanceId } from '../infra/logger.js';
import { pingMongo } from '../infra/mongo.js';
import { pingRedis } from '../infra/redis.js';
import { respond } from '../utils/respond.js';

// Contract route: the check polls it and waits for 200. Raw shape, no envelope.
export const healthController = {
  /** Liveness + readiness: 200 only once boot finished and both stores answer. */
  async healthz(_req: Request, res: Response) {
    if (!isReady()) return respond.raw(res, 503, { ok: false, reason: 'starting' });
    const [mongo, redis] = await Promise.all([pingMongo(), pingRedis()]);
    const ok = mongo && redis;
    return respond.raw(res, ok ? 200 : 503, { ok, mongo, redis, instance: instanceId });
  },
};

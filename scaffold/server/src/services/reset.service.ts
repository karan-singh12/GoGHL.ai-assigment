import { getRedis, rkey } from '../infra/redis.js';
import { RESETTABLE_PATTERNS } from '../realtime/eventStream.js';
import { conversationRepo } from '../repositories/conversation.repo.js';
import { messageRepo } from '../repositories/message.repo.js';

/**
 * Redis key families that are application data. Kept: sessions (sb:sess),
 * pending logins (sb:oidc) and seq counters (sb:seq: seq must never go back,
 * or sockets of running instances would wait for ids they already passed).
 */
const APP_KEY_PATTERNS = [rkey('rl', '*'), rkey('cool', '*'), ...RESETTABLE_PATTERNS];

export const resetService = {
  /** Contract D: delete all application data in MongoDB and Redis; login sessions may stay. */
  async resetAll(): Promise<void> {
    await Promise.all([conversationRepo.deleteAll(), messageRepo.deleteAll()]);
    const redis = getRedis();
    for (const match of APP_KEY_PATTERNS) {
      let cursor = '0';
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', match, 'COUNT', 500);
        if (keys.length) await redis.del(...keys);
        cursor = next;
      } while (cursor !== '0');
    }
  },
};

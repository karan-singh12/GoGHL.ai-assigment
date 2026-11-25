import { createServer } from 'node:http';
import { env } from './config/env.js';
import { createApp } from './app.js';
import { installSignalHandlers, markReady, onShutdown } from './infra/lifecycle.js';
import { instanceId, logger } from './infra/logger.js';
import { closeMongo, connectMongo } from './infra/mongo.js';
import { closeRedis, connectRedis } from './infra/redis.js';
import { attachWebSocketGateway } from './realtime/ws.gateway.js';
import { ensureIndexes } from './repositories/indexes.js';
import { onReplyQueued } from './services/reply.service.js';
import { outboxWorker } from './workers/outbox.worker.js';

// Boot order: listen early (so /healthz answers 503 "starting" instead of
// connection refused), then connect stores, ensure indexes, start background
// work, and only then report ready.
async function main() {
  installSignalHandlers();

  const app = createApp();
  const server = createServer(app);
  server.keepAliveTimeout = 65_000; // outlive typical proxy idle timeouts

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(env.port, resolve);
  });
  logger.info('listening', { port: env.port, env: env.nodeEnv, instance: instanceId });
  onShutdown('http', () => new Promise<void>((r) => server.close(() => r())));

  const db = await connectMongo();
  onShutdown('mongo', closeMongo);
  await connectRedis();
  onShutdown('redis', closeRedis);

  await ensureIndexes(db);

  // Realtime: auth on upgrade + tail of the per-workspace event streams.
  onShutdown('ws', await attachWebSocketGateway(server));

  // Outbox: sends queued replies; new replies wake it immediately.
  outboxWorker.start();
  onReplyQueued(outboxWorker.nudge);
  onShutdown('outbox', () => outboxWorker.stop());

  markReady();
  logger.info('ready', { workspaces: Object.keys(env.pigeon.apiKeys) });
}

main().catch((err) => {
  logger.error('boot failed', { err });
  process.exit(1);
});

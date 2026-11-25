import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { REALTIME, SESSION } from '../config/constants.js';
import { logger } from '../infra/logger.js';
import { membershipOf } from '../middleware/requireMember.js';
import { sessionService } from '../services/session.service.js';
import { parseCookieHeader } from '../utils/cookies.js';
import { framesAfter, startEventReader, type Frame } from './eventStream.js';

// GET /ws?workspace=<id>[&after=<seq>] (contract F).
//
// 1. Auth BEFORE the upgrade: no session -> 401, not a member -> 403, no socket opened.
// 2. ?after=N: replay frames with seq > N from the stream, then continue live.
//    Live frames that arrive during the replay are buffered and flushed after it,
//    and every socket only ever sends seq > lastSent: no gaps, no repeats.
// 3. Live: this instance tails the Redis Stream (eventStream.ts), so a socket on
//    instance A receives what instance B processed.

const log = logger.child({ component: 'ws' });

interface ClientSocket extends WebSocket {
  workspace: string;
  sub: string;
  lastSent: number;
  /** Non-null while the replay is running: live frames wait here. */
  pending: Frame[] | null;
  alive: boolean;
}

const socketsByWorkspace = new Map<string, Set<ClientSocket>>();

function refuse(socket: Duplex, status: 400 | 401 | 403, reason: string) {
  socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

function sendFrames(ws: ClientSocket, frames: Frame[]) {
  for (const f of frames) {
    if (f.seq <= ws.lastSent || ws.readyState !== ws.OPEN) continue;
    if (ws.bufferedAmount > REALTIME.maxBufferedBytes) {
      // Slow consumer: drop it; the client reconnects with ?after=lastSeq and misses nothing.
      ws.close(1013, 'too slow, reconnect with after');
      return;
    }
    ws.send(JSON.stringify(f));
    ws.lastSent = f.seq;
  }
}

/** Called by the stream reader with new frames for one workspace, in seq order. */
function deliver(workspace: string, frames: Frame[]) {
  const set = socketsByWorkspace.get(workspace);
  if (!set) return;
  for (const ws of set) {
    if (ws.pending) ws.pending.push(...frames);
    else sendFrames(ws, frames);
  }
}

async function onConnected(ws: ClientSocket, after: number | null) {
  const set = socketsByWorkspace.get(ws.workspace) ?? new Set<ClientSocket>();
  set.add(ws);
  socketsByWorkspace.set(ws.workspace, set);
  const drop = () => set.delete(ws);
  ws.on('close', drop);
  ws.on('error', drop);
  ws.on('pong', () => {
    ws.alive = true;
  });
  // Clients only listen; anything they send is ignored (maxPayload keeps it small).

  if (after === null) return; // live only
  try {
    const missed = await framesAfter(ws.workspace, after);
    sendFrames(ws, missed);
  } catch (err) {
    log.warn('replay failed', { err });
    ws.close(1011, 'replay failed, reconnect');
  } finally {
    const buffered = ws.pending ?? [];
    ws.pending = null;
    sendFrames(ws, buffered);
  }
}

export async function attachWebSocketGateway(server: Server): Promise<() => Promise<void>> {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 });

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? '/', 'http://internal');
    if (url.pathname !== '/ws') return refuse(socket, 400, 'Bad Request');

    void (async () => {
      const user = await sessionService.get(parseCookieHeader(req.headers.cookie)[SESSION.cookieName]);
      if (!user) return refuse(socket, 401, 'Unauthorized');
      const workspace = url.searchParams.get('workspace');
      if (!membershipOf(user, workspace)) return refuse(socket, 403, 'Forbidden');
      const afterRaw = url.searchParams.get('after');
      const after = afterRaw !== null && /^\d{1,15}$/.test(afterRaw) ? Number(afterRaw) : null;

      wss.handleUpgrade(req, socket, head, (raw) => {
        const ws = Object.assign(raw, {
          workspace: workspace!,
          sub: user.sub,
          lastSent: after ?? 0,
          pending: after === null ? null : ([] as Frame[]),
          alive: true,
        }) as ClientSocket;
        void onConnected(ws, after);
      });
    })().catch((err) => {
      log.warn('upgrade failed', { err });
      socket.destroy();
    });
  });

  const stopReader = await startEventReader(deliver);

  // Heartbeat: terminate sockets that stopped answering pings (half-open TCP).
  const heartbeat = setInterval(() => {
    for (const set of socketsByWorkspace.values()) {
      for (const ws of set) {
        if (!ws.alive) {
          ws.terminate();
          continue;
        }
        ws.alive = false;
        ws.ping();
      }
    }
  }, REALTIME.heartbeatMs);
  heartbeat.unref();

  return async () => {
    clearInterval(heartbeat);
    await stopReader();
    for (const set of socketsByWorkspace.values()) for (const ws of set) ws.close(1001, 'server shutting down');
    await new Promise<void>((r) => wss.close(() => r()));
  };
}

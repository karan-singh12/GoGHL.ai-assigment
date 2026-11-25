import { OUTBOX } from '../config/constants.js';
import { instanceId, logger } from '../infra/logger.js';
import { sendMessage } from '../integrations/pigeon.client.js';
import { messageRepo } from '../repositories/message.repo.js';
import { events } from '../services/event.service.js';
import type { MessageDoc } from '../types/domain.js';
import { rateLimit } from '../utils/rateLimit.js';

// Sends queued replies. Runs on every instance; the lease in Mongo
// (outboxDueAt + outboxOwner) guarantees one sender per reply at a time, and a
// reply leased by an instance that died becomes due again when its lease ends.
//
//  accepted     -> done (status still comes from Pigeon's webhooks)
//  429          -> shared cool-off for the workspace (all instances), retry after it
//  503 / net    -> short workspace pause + exponential backoff
//  timeout      -> retry soon: Pigeon probably accepted it; the retry hits its idempotency cache
//  other 4xx    -> failed, stop

const log = logger.child({ worker: 'outbox' });

const backoff = (attempts: number) => {
  const base = Math.min(OUTBOX.backoffMaxMs, OUTBOX.backoffBaseMs * 2 ** Math.max(0, attempts - 1));
  return base / 2 + Math.random() * (base / 2);
};

export class OutboxWorker {
  private running = false;
  private inFlight = 0;
  private wake: (() => void) | null = null;
  private loopDone: Promise<void> = Promise.resolve();
  /** Local hint: workspaces we know are rate-limited right now (avoids lease/defer churn). */
  private blockedUntil = new Map<string, number>();

  start(): void {
    if (this.running) return;
    this.running = true;
    this.loopDone = this.loop();
    log.info('started', { maxInFlight: OUTBOX.maxInFlight });
  }

  /** Something new is due: skip the poll delay. */
  nudge = (): void => {
    this.wake?.();
  };

  async stop(): Promise<void> {
    this.running = false;
    this.nudge();
    await this.loopDone;
    const until = Date.now() + 3_000; // let in-flight sends finish; leases cover the rest
    while (this.inFlight > 0 && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
  }

  private blockedWorkspaces(now: number): string[] {
    const out: string[] = [];
    for (const [ws, until] of this.blockedUntil) {
      if (until > now) out.push(ws);
      else this.blockedUntil.delete(ws);
    }
    return out;
  }

  private async loop(): Promise<void> {
    while (this.running) {
      try {
        while (this.running && this.inFlight < OUTBOX.maxInFlight) {
          const now = Date.now();
          const job = await messageRepo.leaseNextDue(instanceId, OUTBOX.leaseMs, new Date(now), this.blockedWorkspaces(now));
          if (!job) break;
          this.inFlight++;
          void this.process(job)
            .catch((err) => log.error('send crashed; lease will expire and retry', { ref: job.clientRef, err }))
            .finally(() => {
              this.inFlight--;
              this.nudge();
            });
        }
      } catch (err) {
        log.warn('lease failed', { err });
      }
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, OUTBOX.pollIntervalMs);
        this.wake = () => {
          clearTimeout(t);
          resolve();
        };
      });
      this.wake = null;
    }
  }

  private async process(job: MessageDoc): Promise<void> {
    const ws = job.workspace;
    const wait = await rateLimit.acquire(ws);
    if (wait > 0) {
      this.blockedUntil.set(ws, Date.now() + wait);
      await messageRepo.deferWithoutAttempt(job._id, instanceId, new Date(Date.now() + wait));
      return;
    }

    const result = await sendMessage(ws, { to: job.contact, text: job.text, clientRef: job.clientRef! });
    const ref = job.clientRef;
    switch (result.kind) {
      case 'accepted':
        await messageRepo.markAccepted(job._id, instanceId, result.providerMessageId);
        return;

      case 'rate_limited': {
        const ms = await rateLimit.coolOff(ws, result.retryAfterMs);
        this.blockedUntil.set(ws, Date.now() + ms);
        await messageRepo.reschedule(job._id, instanceId, new Date(Date.now() + ms), '429');
        log.warn('rate limited by Pigeon', { ws, retryAfterMs: result.retryAfterMs });
        return;
      }

      case 'unavailable':
      case 'network': {
        await rateLimit.pause(ws);
        const err = result.kind === 'unavailable' ? `HTTP ${result.status}` : result.error;
        await messageRepo.reschedule(job._id, instanceId, new Date(Date.now() + backoff(job.sendAttempts ?? 1)), err);
        return;
      }

      case 'timeout':
        await messageRepo.reschedule(job._id, instanceId, new Date(Date.now() + OUTBOX.timeoutRetryMs), 'timeout');
        return;

      case 'rejected': {
        const failed = await messageRepo.markFailed(job._id, instanceId, result.error);
        if (failed) await events.status(failed, 'failed');
        log.warn('send rejected permanently', { ws, ref, status: result.status });
        return;
      }
    }
  }
}

export const outboxWorker = new OutboxWorker();

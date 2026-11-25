import type { Request, Response } from 'express';
import { WEBHOOK } from '../config/constants.js';
import { env, isKnownWorkspace } from '../config/env.js';
import { logger } from '../infra/logger.js';
import { inboundService } from '../services/inbound.service.js';
import { verifyPigeonSignature } from '../utils/hmac.js';
import { respond } from '../utils/respond.js';
import { isDeliveryStatus } from '../utils/statusRank.js';
import { InboundData, parseOccurredAt, StatusData, WebhookEnvelope } from '../validators/webhook.schema.js';

const ignored = (res: Response, reason: string) => respond.raw(res, 200, { ok: true, ignored: reason });

/**
 * POST /webhooks/pigeon. The answer table in PIGEON.md, in order:
 *   bad/missing signature -> 401 · stale timestamp -> 401 · unparseable -> 400
 *   unknown workspace / unknown type / unknown message -> 2xx (ignored)
 *   stored (or already stored) -> 2xx, only AFTER the write is durable.
 * A 5xx only happens when storage itself fails, which makes Pigeon retry.
 */
export const webhookController = {
  async pigeon(req: Request, res: Response) {
    const raw = req.rawBody ?? Buffer.alloc(0);
    const verdict = verifyPigeonSignature(
      raw,
      req.get('x-pigeon-signature'),
      env.pigeon.webhookSecret,
      Math.floor(Date.now() / 1000),
      WEBHOOK.toleranceSeconds,
    );
    if (verdict === 'invalid') return respond.status(res, 'WEBHOOK_BAD_SIGNATURE');
    if (verdict === 'stale') return respond.status(res, 'WEBHOOK_STALE');

    let json: unknown;
    try {
      json = JSON.parse(raw.toString('utf8'));
    } catch {
      return respond.status(res, 'WEBHOOK_BAD_BODY');
    }
    const envelope = WebhookEnvelope.safeParse(json);
    if (!envelope.success) return respond.status(res, 'WEBHOOK_BAD_BODY');
    const ev = envelope.data;

    if (!isKnownWorkspace(ev.workspace)) return ignored(res, 'unknown workspace');

    switch (ev.type) {
      case 'message.inbound': {
        const data = InboundData.safeParse(ev.data);
        if (!data.success) return respond.status(res, 'WEBHOOK_BAD_BODY');
        await inboundService.messageInbound({
          workspace: ev.workspace,
          eventId: ev.id,
          messageId: data.data.message_id,
          from: data.data.from,
          text: data.data.text,
          occurredAt: parseOccurredAt(ev.occurred_at),
        });
        return respond.raw(res, 200, { ok: true });
      }
      case 'message.status': {
        const data = StatusData.safeParse(ev.data);
        if (!data.success) return respond.status(res, 'WEBHOOK_BAD_BODY');
        if (!isDeliveryStatus(data.data.status)) return ignored(res, 'unknown status');
        const { applied } = await inboundService.messageStatus({
          workspace: ev.workspace,
          clientRef: data.data.client_ref,
          status: data.data.status,
          providerMessageId: data.data.message_id,
        });
        return applied ? respond.raw(res, 200, { ok: true }) : ignored(res, 'not newer or unknown message');
      }
      default:
        logger.debug('webhook type ignored', { type: ev.type });
        return ignored(res, 'unknown type');
    }
  },
};

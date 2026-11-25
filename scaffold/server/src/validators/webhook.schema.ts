import { z } from 'zod';

// Pigeon webhook bodies. Unknown fields are ignored (Pigeon may add some).

export const WebhookEnvelope = z.object({
  id: z.string().max(200).optional(),
  type: z.string().min(1).max(100),
  workspace: z.string().min(1).max(128),
  occurred_at: z.string().max(64).optional(),
  data: z.unknown(),
});

export const InboundData = z.object({
  message_id: z.string().min(1).max(200),
  from: z.string().min(1).max(64),
  text: z.string().max(10_000).default(''),
});

export const StatusData = z.object({
  message_id: z.string().max(200).optional(),
  client_ref: z.string().min(1).max(200),
  /** Not an enum on purpose: an unknown future status is ignored with 2xx, not a 400. */
  status: z.string().min(1).max(50),
});

/** occurred_at -> Date; missing/invalid falls back to receipt time (still stored, never rejected). */
export function parseOccurredAt(v: string | undefined, now = new Date()): Date {
  if (!v) return now;
  const t = Date.parse(v);
  return Number.isNaN(t) ? now : new Date(t);
}

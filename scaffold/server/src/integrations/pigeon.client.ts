import { OUTBOX } from '../config/constants.js';
import { env } from '../config/env.js';
import { parseRetryAfter } from '../utils/rateLimit.js';

export type SendResult =
  | { kind: 'accepted'; providerMessageId: string | null }
  | { kind: 'rate_limited'; retryAfterMs: number }
  | { kind: 'unavailable'; status: number }
  | { kind: 'timeout' }
  | { kind: 'network'; error: string }
  | { kind: 'rejected'; status: number; error: string };

/**
 * POST /v1/messages. Always sends Idempotency-Key = client_ref, so any retry
 * (after a timeout, a crash, or another instance taking over) is answered
 * from Pigeon's cache and never delivered twice.
 */
export async function sendMessage(workspace: string, msg: { to: string; text: string; clientRef: string }): Promise<SendResult> {
  const apiKey = env.pigeon.apiKeys[workspace];
  if (!apiKey) return { kind: 'rejected', status: 0, error: `no API key for ${workspace}` };

  let res: Response;
  try {
    res = await fetch(`${env.pigeon.url.replace(/\/$/, '')}/v1/messages`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'idempotency-key': msg.clientRef,
      },
      body: JSON.stringify({ to: msg.to, text: msg.text, client_ref: msg.clientRef }),
      signal: AbortSignal.timeout(OUTBOX.sendTimeoutMs),
    });
  } catch (err) {
    const name = (err as Error).name;
    if (name === 'TimeoutError' || name === 'AbortError') return { kind: 'timeout' };
    return { kind: 'network', error: (err as Error).message };
  }

  if (res.ok) {
    const body = (await res.json().catch(() => ({}))) as { id?: unknown };
    return { kind: 'accepted', providerMessageId: typeof body.id === 'string' ? body.id : null };
  }
  await res.body?.cancel().catch(() => undefined);
  if (res.status === 429) return { kind: 'rate_limited', retryAfterMs: parseRetryAfter(res.headers.get('retry-after')) };
  if (res.status >= 500) return { kind: 'unavailable', status: res.status };
  return { kind: 'rejected', status: res.status, error: `HTTP ${res.status}` };
}

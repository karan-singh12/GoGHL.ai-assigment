import { describe, expect, it } from 'vitest';
import { applyStatus, mergeMessages, nextStatus } from './messages';
import type { Message } from './types';

const inbound = (id: string, at: string): Message => ({ id, dir: 'in', text: id, occurredAt: at, providerId: id });
const out = (ref: string, at: string, extra: Partial<Message> = {}): Message => ({
  id: `local:${ref}`,
  dir: 'out',
  text: ref,
  occurredAt: at,
  clientRef: ref,
  status: 'queued',
  ...extra,
});

describe('nextStatus', () => {
  it('moves forward only', () => {
    expect(nextStatus('queued', 'sent')).toBe('sent');
    expect(nextStatus('delivered', 'sent')).toBe('delivered');
    expect(nextStatus('failed', 'queued')).toBe('failed');
    expect(nextStatus(undefined, 'sent')).toBe('sent');
  });
});

describe('mergeMessages', () => {
  it('dedupes by provider id and sorts by occurredAt', () => {
    const a = inbound('pmsg_1', '2026-01-01T10:00:00Z');
    const b = inbound('pmsg_2', '2026-01-01T09:00:00Z');
    const merged = mergeMessages([a], [b, a]);
    expect(merged.map((m) => m.id)).toEqual(['pmsg_2', 'pmsg_1']);
  });

  it('replaces an optimistic reply with the server copy, keeping the furthest status', () => {
    const optimistic = out('r1', '2026-01-01T10:00:00Z', { pending: true, status: 'delivered' });
    const server = { ...out('r1', '2026-01-01T10:00:01Z'), id: 'srv_9', status: 'sent' as const };
    const [m] = mergeMessages([optimistic], [server]);
    expect(m.id).toBe('srv_9');
    expect(m.pending).toBe(false);
    expect(m.status).toBe('delivered');
  });
});

describe('applyStatus', () => {
  it('returns the same array when nothing changes (no re-render)', () => {
    const list = [out('r1', '2026-01-01T10:00:00Z', { status: 'delivered' })];
    expect(applyStatus(list, 'r1', 'sent')).toBe(list);
  });

  it('updates the matching reply only', () => {
    const list = [out('r1', '2026-01-01T10:00:00Z'), out('r2', '2026-01-01T10:00:01Z')];
    const next = applyStatus(list, 'r2', 'delivered');
    expect(next[0].status).toBe('queued');
    expect(next[1].status).toBe('delivered');
  });
});

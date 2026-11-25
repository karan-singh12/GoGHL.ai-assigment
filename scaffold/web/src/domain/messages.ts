import type { DeliveryStatus, Message } from './types';

// Pure rules for a conversation's message list. No React, fully unit-tested.

const STATUS_RANK: Record<DeliveryStatus, number> = { queued: 0, sent: 1, delivered: 2, failed: 2 };

/** Status only moves forward: a late "sent" never overwrites "delivered". */
export function nextStatus(current: DeliveryStatus | null | undefined, incoming: DeliveryStatus): DeliveryStatus {
  if (!current) return incoming;
  return STATUS_RANK[incoming] > STATUS_RANK[current] ? incoming : current;
}

/** Stable identity of a message across optimistic, server and socket copies. */
export function messageKey(m: Pick<Message, 'id' | 'clientRef' | 'providerId'>): string {
  if (m.clientRef) return `ref:${m.clientRef}`;
  if (m.providerId) return `pm:${m.providerId}`;
  return `id:${m.id}`;
}

export function compareMessages(a: Message, b: Message): number {
  const t = Date.parse(a.occurredAt) - Date.parse(b.occurredAt);
  if (t !== 0) return t;
  return messageKey(a) < messageKey(b) ? -1 : messageKey(a) > messageKey(b) ? 1 : 0;
}

/**
 * Merge incoming messages into a list: dedupe by identity, keep the furthest
 * status, prefer server fields over optimistic ones, and sort oldest first.
 */
export function mergeMessages(existing: readonly Message[], incoming: readonly Message[]): Message[] {
  const byKey = new Map<string, Message>();
  for (const m of existing) byKey.set(messageKey(m), m);
  for (const m of incoming) {
    const key = messageKey(m);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, m);
      continue;
    }
    const status = m.status ? nextStatus(prev.status, m.status) : prev.status;
    const fromServer = !m.pending;
    byKey.set(key, {
      ...prev,
      ...m,
      id: fromServer && !m.id.startsWith('local:') ? m.id : prev.id,
      status,
      pending: fromServer ? false : prev.pending,
      submitFailed: fromServer ? false : m.submitFailed ?? prev.submitFailed,
    });
  }
  return [...byKey.values()].sort(compareMessages);
}

/** Apply a delivery status to the message with this clientRef. Returns the same array if nothing changed. */
export function applyStatus(list: readonly Message[], clientRef: string, status: DeliveryStatus): readonly Message[] {
  let changed = false;
  const out = list.map((m) => {
    if (m.clientRef !== clientRef) return m;
    const s = nextStatus(m.status, status);
    if (s === m.status) return m;
    changed = true;
    return { ...m, status: s };
  });
  return changed ? out : list;
}

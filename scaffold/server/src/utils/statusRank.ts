import type { DeliveryStatus } from '../types/domain.js';

// Delivery status only moves forward. delivered and failed are both final.
export const STATUS_RANK: Readonly<Record<DeliveryStatus, number>> = Object.freeze({
  queued: 0,
  sent: 1,
  delivered: 2,
  failed: 2,
});

export const DELIVERY_STATUSES = Object.keys(STATUS_RANK) as DeliveryStatus[];

export const isDeliveryStatus = (s: unknown): s is DeliveryStatus =>
  typeof s === 'string' && Object.hasOwn(STATUS_RANK, s);

export const rankOf = (s: DeliveryStatus): number => STATUS_RANK[s];

/** True if moving from `from` to `to` is allowed (strictly forward). */
export const canTransition = (from: DeliveryStatus | null | undefined, to: DeliveryStatus): boolean =>
  from == null || STATUS_RANK[to] > STATUS_RANK[from];

/** Idempotency key for a reply. Created once per message, reused on every retry. */
export const newClientRef = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `ref-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

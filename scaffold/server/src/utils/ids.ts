import { randomBytes } from 'node:crypto';

/** Short, sortable-enough, prefixed id: newId('req') -> "req_lx3k9a_4f1c2b8e". */
export const newId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`;

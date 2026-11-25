import type { Conversation, Message, Page } from '../domain/types';
import { applyStatus, mergeMessages } from '../domain/messages';

// Structural twin of TanStack's InfiniteData, so these helpers stay React-free and testable.
export interface Paged<T> {
  pages: Page<T>[];
  pageParams: unknown[];
}

/**
 * Messages are loaded newest page first (pages[0] = latest, older pages follow).
 * New messages always land in pages[0]; an id already in any page is merged in place.
 */
export function upsertMessages(data: Paged<Message> | undefined, incoming: Message[]): Paged<Message> | undefined {
  if (!data) return data;
  const pages = data.pages.map((p) => ({ ...p }));
  const rest: Message[] = [];
  for (const m of incoming) {
    const idx = pages.findIndex((p) => p.items.some((x) => sameMessage(x, m)));
    if (idx >= 0) pages[idx].items = mergeMessages(pages[idx].items, [m]);
    else rest.push(m);
  }
  if (rest.length) {
    if (!pages.length) pages.push({ items: [] });
    pages[0].items = mergeMessages(pages[0].items, rest);
  }
  return { ...data, pages };
}

function sameMessage(a: Message, b: Message): boolean {
  if (a.clientRef && b.clientRef) return a.clientRef === b.clientRef;
  if (a.providerId && b.providerId) return a.providerId === b.providerId;
  return a.id === b.id;
}

export function patchMessageStatus(
  data: Paged<Message> | undefined,
  clientRef: string,
  status: NonNullable<Message['status']>,
): Paged<Message> | undefined {
  if (!data) return data;
  let changed = false;
  const pages = data.pages.map((p) => {
    const items = applyStatus(p.items, clientRef, status);
    if (items === p.items) return p;
    changed = true;
    return { ...p, items: [...items] };
  });
  return changed ? { ...data, pages } : data;
}

export function patchMessage(data: Paged<Message> | undefined, clientRef: string, patch: Partial<Message>): Paged<Message> | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((p) => ({ ...p, items: p.items.map((m) => (m.clientRef === clientRef ? { ...m, ...patch } : m)) })),
  };
}

/** Flatten newest-first pages into one oldest-first list for rendering. */
export function flattenMessages(data: Paged<Message> | undefined): Message[] {
  if (!data) return [];
  return mergeMessages([], [...data.pages].reverse().flatMap((p) => p.items));
}

export function patchConversationInPages(
  data: Paged<Conversation> | undefined,
  contact: string,
  patch: Partial<Conversation>,
): Paged<Conversation> | undefined {
  if (!data) return data;
  let changed = false;
  const pages = data.pages.map((p) => ({
    ...p,
    items: p.items.map((c) => {
      if (c.contact !== contact) return c;
      changed = true;
      return { ...c, ...patch };
    }),
  }));
  return changed ? { ...data, pages } : data;
}

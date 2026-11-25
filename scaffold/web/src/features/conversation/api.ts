import { enc, http } from '../../lib/http';
import type { Conversation, Message, Page } from '../../domain/types';

export type ConversationAction = 'claim' | 'release' | 'close' | 'reopen';

const base = (contact: string) => `/api/conversations/${enc(contact)}`;

export const conversationApi = {
  async get(workspace: string, contact: string, signal?: AbortSignal): Promise<Conversation> {
    return (await http.get<Conversation>(base(contact), { workspace }, signal)).data;
  },

  /** Newest page first; `before` walks back in time. Items inside a page are oldest first. */
  async messages(workspace: string, contact: string, before: string | undefined, signal?: AbortSignal): Promise<Page<Message>> {
    const res = await http.get<{ items: Message[] }>(`${base(contact)}/messages`, { workspace, before, limit: 50 }, signal);
    return { items: res.data?.items ?? [], prevCursor: (res.meta?.prevCursor as string | null | undefined) ?? null };
  },

  /** Idempotent on clientRef: safe to call again after a timeout or network error. */
  async reply(workspace: string, contact: string, text: string, clientRef: string): Promise<Message | undefined> {
    return (await http.post<Message | undefined>(`${base(contact)}/replies`, { text, client_ref: clientRef }, { workspace })).data;
  },

  async act(workspace: string, contact: string, action: ConversationAction): Promise<Conversation> {
    return (await http.post<Conversation>(`${base(contact)}/${action}`, {}, { workspace })).data;
  },
};

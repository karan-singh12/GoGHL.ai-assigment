import { enc, http } from '../../lib/http';
import type { Conversation, InboxFilter, Page } from '../../domain/types';

export const inboxApi = {
  async list(workspace: string, filter: InboxFilter, cursor: string | undefined, signal?: AbortSignal): Promise<Page<Conversation>> {
    const res = await http.get<{ items: Conversation[] }>(
      '/api/conversations',
      { workspace, filter, cursor, limit: 25 },
      signal,
    );
    return { items: res.data?.items ?? [], nextCursor: (res.meta?.nextCursor as string | null | undefined) ?? null };
  },
};

export const conversationPath = (workspace: string, contact: string) => `/w/${enc(workspace)}/c/${enc(contact)}`;

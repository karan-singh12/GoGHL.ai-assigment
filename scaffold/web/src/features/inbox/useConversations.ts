import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { qk } from '../../lib/queryKeys';
import type { InboxFilter } from '../../domain/types';
import { inboxApi } from './api';

export function useConversations(workspace: string, filter: InboxFilter) {
  const query = useInfiniteQuery({
    queryKey: qk.conversations(workspace, filter),
    queryFn: ({ pageParam, signal }) => inboxApi.list(workspace, filter, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  // Pages can overlap when new activity reorders the list between fetches; dedupe by contact.
  const items = useMemo(() => {
    const seen = new Set<string>();
    return (query.data?.pages ?? []).flatMap((p) => p.items).filter((c) => !seen.has(c.contact) && !!seen.add(c.contact));
  }, [query.data]);

  return { ...query, items };
}

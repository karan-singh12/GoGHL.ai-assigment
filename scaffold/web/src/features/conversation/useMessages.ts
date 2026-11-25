import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { flattenMessages } from '../../lib/cache';
import { qk } from '../../lib/queryKeys';
import { conversationApi } from './api';

/** pages[0] is the newest page; fetchNextPage loads OLDER messages (lib/cache.ts relies on this). */
export function useMessages(workspace: string, contact: string) {
  const query = useInfiniteQuery({
    queryKey: qk.messages(workspace, contact),
    queryFn: ({ pageParam, signal }) => conversationApi.messages(workspace, contact, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.prevCursor ?? undefined,
  });

  const messages = useMemo(() => flattenMessages(query.data), [query.data]);
  return { ...query, messages };
}

import { useQuery } from '@tanstack/react-query';
import { qk } from '../../lib/queryKeys';
import { conversationApi } from './api';

export function useConversation(workspace: string, contact: string) {
  return useQuery({
    queryKey: qk.conversation(workspace, contact),
    queryFn: ({ signal }) => conversationApi.get(workspace, contact, signal),
  });
}

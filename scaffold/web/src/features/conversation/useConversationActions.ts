import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../lib/http';
import { patchConversationInPages, type Paged } from '../../lib/cache';
import { qk } from '../../lib/queryKeys';
import type { Conversation } from '../../domain/types';
import { messageFor } from '../../constants/uiMessages';
import { useToast } from '../../shared/toast/ToastProvider';
import { conversationApi, type ConversationAction } from './api';

const DONE: Record<ConversationAction, string> = {
  claim: 'You now hold this conversation.',
  release: 'Conversation released.',
  close: 'Conversation closed.',
  reopen: 'Conversation reopened.',
};

/** Claim / release / close / reopen. Not optimistic: the server decides who wins a claim race. */
export function useConversationActions(workspace: string, contact: string) {
  const qc = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (action: ConversationAction) => conversationApi.act(workspace, contact, action),
    onSuccess: (conv, action) => {
      if (conv) {
        qc.setQueryData<Conversation>(qk.conversation(workspace, contact), conv);
        qc.setQueriesData<Paged<Conversation>>({ queryKey: qk.conversationsAll(workspace) }, (d) =>
          patchConversationInPages(d, contact, conv),
        );
      }
      void qc.invalidateQueries({ queryKey: qk.conversationsAll(workspace) });
      toast.success(DONE[action]);
    },
    onError: (err) => {
      toast.error(messageFor(err));
      // Lost a race (409) or stale view: show the truth.
      if (err instanceof ApiError && (err.status === 409 || err.status === 404)) {
        void qc.invalidateQueries({ queryKey: qk.conversation(workspace, contact) });
      }
    },
  });
}

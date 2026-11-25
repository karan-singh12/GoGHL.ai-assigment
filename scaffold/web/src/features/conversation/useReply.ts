import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { ApiError } from '../../lib/http';
import { patchMessage, upsertMessages, type Paged } from '../../lib/cache';
import { newClientRef } from '../../lib/ids';
import { qk } from '../../lib/queryKeys';
import type { Message } from '../../domain/types';
import { messageFor } from '../../constants/uiMessages';
import { useToast } from '../../shared/toast/ToastProvider';
import { conversationApi } from './api';

interface Vars {
  text: string;
  clientRef: string;
}

/**
 * Sending a reply, safely:
 *  1. the clientRef is created once, before the first attempt
 *  2. the message appears at once (optimistic, "queued")
 *  3. network errors / 5xx retry with the SAME clientRef (server dedupes)
 *  4. if all attempts fail, the bubble offers "Retry", again with the same clientRef
 */
export function useReply(workspace: string, contact: string, sub: string) {
  const qc = useQueryClient();
  const toast = useToast();
  const key = qk.messages(workspace, contact);

  const mutation = useMutation({
    mutationFn: ({ text, clientRef }: Vars) => conversationApi.reply(workspace, contact, text, clientRef),
    retry: (count, err) => count < 3 && (!(err instanceof ApiError) || err.retryable),
    retryDelay: (attempt) => Math.min(4_000, 500 * 2 ** attempt),

    onMutate: async ({ text, clientRef }) => {
      await qc.cancelQueries({ queryKey: key });
      const optimistic: Message = {
        id: `local:${clientRef}`,
        dir: 'out',
        text,
        clientRef,
        occurredAt: new Date().toISOString(),
        status: 'queued',
        authorSub: sub,
        pending: true,
        submitFailed: false,
      };
      qc.setQueryData<Paged<Message>>(key, (d) =>
        upsertMessages(d ?? { pages: [{ items: [] }], pageParams: [undefined] }, [optimistic]),
      );
    },

    onSuccess: (serverMsg, { clientRef }) => {
      qc.setQueryData<Paged<Message>>(key, (d) =>
        serverMsg ? upsertMessages(d, [{ ...serverMsg, pending: false }]) : patchMessage(d, clientRef, { pending: false }),
      );
      void qc.invalidateQueries({ queryKey: qk.conversationsAll(workspace) });
    },

    onError: (err, { clientRef }) => {
      qc.setQueryData<Paged<Message>>(key, (d) => patchMessage(d, clientRef, { pending: false, submitFailed: true }));
      toast.error(messageFor(err));
    },
  });

  const send = useCallback((text: string) => mutation.mutate({ text, clientRef: newClientRef() }), [mutation]);

  const retry = useCallback(
    (m: Message) => {
      if (!m.clientRef) return;
      qc.setQueryData<Paged<Message>>(key, (d) => patchMessage(d, m.clientRef!, { pending: true, submitFailed: false }));
      mutation.mutate({ text: m.text, clientRef: m.clientRef });
    },
    [mutation, qc, key],
  );

  return { send, retry, isSending: mutation.isPending };
}

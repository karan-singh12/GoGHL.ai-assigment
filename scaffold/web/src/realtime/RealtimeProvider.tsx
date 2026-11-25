import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { patchConversationInPages, patchMessageStatus, upsertMessages, type Paged } from '../lib/cache';
import { http } from '../lib/http';
import { qk } from '../lib/queryKeys';
import type { Conversation, Message } from '../domain/types';
import { frameToActions, type Frame, type FrameAction } from './frames';
import { RealtimeConnection, type ConnectionStatus } from './RealtimeConnection';

const StatusContext = createContext<ConnectionStatus>('connecting');
export const useConnectionStatus = () => useContext(StatusContext);

const LIST_REFRESH_DEBOUNCE_MS = 300;

/** Executes the pure frame actions against the query cache. */
function makeExecutor(qc: QueryClient, ws: string) {
  let listTimer: ReturnType<typeof setTimeout> | null = null;
  const refreshList = () => {
    if (listTimer) return;
    listTimer = setTimeout(() => {
      listTimer = null;
      void qc.invalidateQueries({ queryKey: qk.conversationsAll(ws) });
    }, LIST_REFRESH_DEBOUNCE_MS);
  };

  const run = (a: FrameAction) => {
    switch (a.kind) {
      case 'upsertMessage':
        qc.setQueryData<Paged<Message>>(qk.messages(ws, a.contact), (d) => upsertMessages(d, [a.message]));
        return;
      case 'invalidateMessages':
        void qc.invalidateQueries({ queryKey: qk.messages(ws, a.contact) });
        return;
      case 'patchStatus':
        qc.setQueryData<Paged<Message>>(qk.messages(ws, a.contact), (d) => patchMessageStatus(d, a.clientRef, a.status));
        return;
      case 'patchConversation':
        qc.setQueryData<Conversation>(qk.conversation(ws, a.contact), (c) => (c ? { ...c, ...a.patch } : c));
        qc.setQueriesData<Paged<Conversation>>({ queryKey: qk.conversationsAll(ws) }, (d) =>
          patchConversationInPages(d, a.contact, a.patch),
        );
        return;
      case 'refreshList':
        refreshList();
        return;
    }
  };

  return {
    onFrame: (f: Frame) => frameToActions(f).forEach(run),
    dispose: () => listTimer && clearTimeout(listTimer),
  };
}

export function RealtimeProvider({ workspace, children }: { workspace: string; children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const qcRef = useRef(qc);
  qcRef.current = qc;

  useEffect(() => {
    const exec = makeExecutor(qcRef.current, workspace);
    const conn = new RealtimeConnection({
      workspace,
      onFrame: exec.onFrame,
      onStatus: setStatus,
      onOpen: ({ replayed }) => {
        // Cold start: data fetched before the socket opened may have missed frames.
        if (!replayed) void qcRef.current.invalidateQueries({ queryKey: qk.workspace(workspace) });
      },
      checkSession: async () => {
        try {
          await http.raw('/api/me');
          return true;
        } catch {
          void qcRef.current.invalidateQueries({ queryKey: qk.me });
          return false;
        }
      },
    });
    conn.start();
    return () => {
      conn.stop();
      exec.dispose();
    };
  }, [workspace]);

  return <StatusContext.Provider value={status}>{children}</StatusContext.Provider>;
}

import { env } from '../config/env.js';
import { conversationRepo } from '../repositories/conversation.repo.js';
import { messageRepo } from '../repositories/message.repo.js';
import type { DeliveryStatus } from '../types/domain.js';

interface WorkspaceSnapshot {
  contacts: Record<string, { inbound: string[]; assignee: string | null }>;
  outbound: Record<string, DeliveryStatus>;
}

/** GET /__grader/snapshot: what the system believes, read through the same repositories the UI uses. */
export const snapshotService = {
  async build(): Promise<{ workspaces: Record<string, WorkspaceSnapshot> }> {
    const names = new Set([
      ...Object.keys(env.pigeon.apiKeys),
      ...(await conversationRepo.workspacesWithData()),
      ...(await messageRepo.workspacesWithData()),
    ]);
    const workspaces: Record<string, WorkspaceSnapshot> = {};
    await Promise.all(
      [...names].map(async (ws) => {
        const [inbound, convs, outbound] = await Promise.all([
          messageRepo.inboundIdsByContact(ws),
          conversationRepo.listAll(ws),
          messageRepo.outboundStatuses(ws),
        ]);
        const contacts: WorkspaceSnapshot['contacts'] = {};
        for (const c of convs) contacts[c.contact] = { inbound: inbound.get(c.contact) ?? [], assignee: c.assignee ?? null };
        for (const [contact, ids] of inbound) contacts[contact] ??= { inbound: ids, assignee: null };
        workspaces[ws] = { contacts, outbound };
      }),
    );
    return { workspaces };
  },
};

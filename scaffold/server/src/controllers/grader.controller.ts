import type { Request, Response } from 'express';
import type { z } from 'zod';
import { conversationService } from '../services/conversation.service.js';
import { replyService } from '../services/reply.service.js';
import { resetService } from '../services/reset.service.js';
import { snapshotService } from '../services/snapshot.service.js';
import { respond } from '../utils/respond.js';
import type { GraderClaimBody, GraderReplyBody } from '../validators/grader.schema.js';

// Contract D. Token-protected (requireGraderToken), never session-protected.
// Every handler calls the SAME services as the UI controllers.
export const graderController = {
  async reset(_req: Request, res: Response) {
    await resetService.resetAll();
    return respond.raw(res, 200, { ok: true });
  },

  async snapshot(_req: Request, res: Response) {
    return respond.raw(res, 200, await snapshotService.build());
  },

  /** 202 once stored; same client_ref twice (even concurrently) is one reply. Unknown workspace -> 404. */
  async reply(req: Request, res: Response) {
    const b = req.body as z.infer<typeof GraderReplyBody>;
    const m = await replyService.create({ workspace: b.workspace, contact: b.contact, text: b.text, clientRef: b.client_ref, authorSub: null });
    return respond.raw(res, 202, { ok: true, client_ref: m.clientRef, status: m.status });
  },

  /** 200 if this agent now holds it (or already did), 409 if someone else does. */
  async claim(req: Request, res: Response) {
    const b = req.body as z.infer<typeof GraderClaimBody>;
    const r = await conversationService.claim(b.workspace, b.contact, b.agent);
    return respond.raw(res, r.status === 'taken' ? 409 : 200, { ok: r.status !== 'taken', assignee: r.conversation.assignee });
  },
};

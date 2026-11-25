import type { Request, Response } from 'express';
import { conversationService } from '../services/conversation.service.js';
import { toMessageDto } from '../services/dto.js';
import { replyService } from '../services/reply.service.js';
import { AppError } from '../utils/AppError.js';
import { respond } from '../utils/respond.js';
import type { ListConversationsQuery, MessagesQuery, ReplyBody } from '../validators/conversation.schema.js';

// All routes run behind requireSession + requireMember, so req.user and
// req.workspace (id + caller's role) are set and trusted.

export const conversationController = {
  /** GET /api/conversations?workspace=&filter=&cursor=&limit= (contract E). */
  async list(req: Request, res: Response) {
    const q = req.query as unknown as ListConversationsQuery;
    const page = await conversationService.list(req.workspace!.id, req.user!.sub, q);
    return respond.ok(res, 'CONVERSATIONS_LISTED', { items: page.items }, { meta: { nextCursor: page.nextCursor } });
  },

  /** GET /api/conversations/:contact?workspace= */
  async get(req: Request, res: Response) {
    return respond.ok(res, 'OK', await conversationService.get(req.workspace!.id, req.params.contact));
  },

  /** GET /api/conversations/:contact/messages?workspace=&before=&limit= (oldest first; prevCursor walks back). */
  async messages(req: Request, res: Response) {
    const q = req.query as unknown as MessagesQuery;
    const page = await conversationService.messages(req.workspace!.id, req.params.contact, q);
    return respond.ok(res, 'MESSAGES_LISTED', { items: page.items }, { meta: { prevCursor: page.prevCursor } });
  },

  /** POST /api/conversations/:contact/replies?workspace=  { text, client_ref } -> 202 once stored. */
  async reply(req: Request, res: Response) {
    const b = req.body as ReplyBody;
    const m = await replyService.createAsAgent({
      workspace: req.workspace!.id,
      contact: req.params.contact,
      text: b.text,
      clientRef: b.client_ref,
      sub: req.user!.sub,
      role: req.workspace!.role,
    });
    return respond.ok(res, 'REPLY_QUEUED', toMessageDto(m));
  },

  /** POST /api/conversations/:contact/:action?workspace=  (claim | release | close | reopen) */
  async act(req: Request, res: Response) {
    const ws = req.workspace!;
    const sub = req.user!.sub;
    const contact = req.params.contact;
    switch (req.params.action) {
      case 'claim': {
        const r = await conversationService.claim(ws.id, contact, sub, { takeOver: ws.role === 'admin' });
        if (r.status === 'taken') throw new AppError('CONVERSATION_TAKEN');
        return respond.ok(res, 'CONVERSATION_CLAIMED', r.conversation);
      }
      case 'release':
        return respond.ok(res, 'CONVERSATION_RELEASED', await conversationService.release(ws.id, contact, sub, ws.role));
      case 'close':
        return respond.ok(res, 'CONVERSATION_CLOSED', await conversationService.setState(ws.id, contact, 'closed', sub, ws.role));
      case 'reopen':
        return respond.ok(res, 'CONVERSATION_REOPENED', await conversationService.setState(ws.id, contact, 'open', sub, ws.role));
      default:
        throw new AppError('ROUTE_NOT_FOUND');
    }
  },
};

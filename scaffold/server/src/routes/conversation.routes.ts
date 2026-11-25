import { Router } from 'express';
import { conversationController } from '../controllers/conversation.controller.js';
import { requireWorkspaceMember } from '../middleware/requireMember.js';
import { requireSession } from '../middleware/requireSession.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  ContactParams,
  ConversationActionParams,
  ListConversationsQuery,
  MessagesQuery,
  ReplyBody,
  WorkspaceQuery,
} from '../validators/conversation.schema.js';

export const conversationRoutes = Router();

// Every route: 401 (no session) -> 403 (not a member of ?workspace=) -> 400 (bad input).
const guard = [requireSession, requireWorkspaceMember];

conversationRoutes.get('/api/conversations', ...guard, validate({ query: ListConversationsQuery }), asyncHandler(conversationController.list));

conversationRoutes.get(
  '/api/conversations/:contact',
  ...guard,
  validate({ params: ContactParams, query: WorkspaceQuery }),
  asyncHandler(conversationController.get),
);

conversationRoutes.get(
  '/api/conversations/:contact/messages',
  ...guard,
  validate({ params: ContactParams, query: MessagesQuery }),
  asyncHandler(conversationController.messages),
);

conversationRoutes.post(
  '/api/conversations/:contact/replies',
  ...guard,
  validate({ params: ContactParams, query: WorkspaceQuery, body: ReplyBody }),
  asyncHandler(conversationController.reply),
);

conversationRoutes.post(
  '/api/conversations/:contact/:action(claim|release|close|reopen)',
  ...guard,
  validate({ params: ConversationActionParams, query: WorkspaceQuery }),
  asyncHandler(conversationController.act),
);

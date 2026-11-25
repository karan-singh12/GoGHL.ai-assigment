import { Router } from 'express';
import { graderController } from '../controllers/grader.controller.js';
import { requireGraderToken } from '../middleware/requireGraderToken.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { GraderClaimBody, GraderReplyBody } from '../validators/grader.schema.js';

export const graderRoutes = Router();

graderRoutes.use('/__grader', requireGraderToken);
graderRoutes.post('/__grader/reset', asyncHandler(graderController.reset));
graderRoutes.get('/__grader/snapshot', asyncHandler(graderController.snapshot));
graderRoutes.post('/__grader/reply', validate({ body: GraderReplyBody }), asyncHandler(graderController.reply));
graderRoutes.post('/__grader/claim', validate({ body: GraderClaimBody }), asyncHandler(graderController.claim));

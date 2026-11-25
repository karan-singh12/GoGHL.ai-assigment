import { Router } from 'express';
import { webhookController } from '../controllers/webhook.controller.js';
import { rawBody } from '../middleware/rawBody.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const webhookRoutes = Router();

// Contract C. Raw body (exact signed bytes), mounted before express.json().
webhookRoutes.post('/webhooks/pigeon', ...rawBody, asyncHandler(webhookController.pigeon));

import { Router } from 'express';
import { authRoutes } from './auth.routes.js';
import { conversationRoutes } from './conversation.routes.js';
import { graderRoutes } from './grader.routes.js';
import { healthRoutes } from './health.routes.js';
import { meRoutes } from './me.routes.js';
import { webhookRoutes } from './webhook.routes.js';

/** Routes that take JSON bodies. Mounted after express.json(). */
export const jsonRoutes = Router();
jsonRoutes.use(healthRoutes);
jsonRoutes.use(authRoutes);
jsonRoutes.use(meRoutes);
jsonRoutes.use(conversationRoutes);
jsonRoutes.use(graderRoutes);

/** Routes that need the exact raw bytes (HMAC). Mounted BEFORE express.json(). */
export const rawRoutes = Router();
rawRoutes.use(webhookRoutes);

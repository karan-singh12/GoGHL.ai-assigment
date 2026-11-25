import { Router } from 'express';
import { healthRoutes } from './health.routes.js';

/**
 * Routes that take JSON bodies. Mounted after express.json().
 * Planned (added after the API design discussion):
 *   /auth/*        auth.routes.ts
 *   /api/*         me.routes.ts, conversation.routes.ts
 *   /__grader/*    grader.routes.ts (requireGraderToken)
 */
export const jsonRoutes = Router();
jsonRoutes.use(healthRoutes);

/**
 * Routes that need the exact raw bytes (HMAC). Mounted BEFORE express.json().
 *   POST /webhooks/pigeon   webhook.routes.ts (rawBody)
 */
export const rawRoutes = Router();

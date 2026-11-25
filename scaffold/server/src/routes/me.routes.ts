import { Router } from 'express';
import { meController } from '../controllers/me.controller.js';
import { requireSession } from '../middleware/requireSession.js';

export const meRoutes = Router();

meRoutes.get('/api/me', requireSession, meController.me);

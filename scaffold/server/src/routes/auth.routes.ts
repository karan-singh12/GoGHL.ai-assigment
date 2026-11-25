import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { CallbackQuery, LoginQuery } from '../validators/auth.schema.js';

export const authRoutes = Router();

authRoutes.get('/auth/login', validate({ query: LoginQuery }), asyncHandler(authController.login));
authRoutes.get('/auth/callback', validate({ query: CallbackQuery }), asyncHandler(authController.callback));
authRoutes.post('/auth/logout', asyncHandler(authController.logout));

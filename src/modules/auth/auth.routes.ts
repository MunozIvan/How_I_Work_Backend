import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { rateLimit } from '../../middlewares/rate-limit.js';
import * as authController from './auth.controller.js';

export const authRouter = Router();

// 10 tries per minute per IP. Enough for a human, annoying for a bot.
const authLimiter = rateLimit({ name: 'auth', max: 10, windowSeconds: 60 });

authRouter.post('/register', authLimiter, authController.register);
authRouter.post('/login', authLimiter, authController.login);
authRouter.get('/me', requireAuth, authController.me);

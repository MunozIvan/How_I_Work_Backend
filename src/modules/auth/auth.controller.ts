import type { Request, Response } from 'express';
import { currentUser } from '../../middlewares/auth.js';
import { loginSchema, registerSchema } from './auth.schemas.js';
import * as authService from './auth.service.js';

export async function register(req: Request, res: Response) {
  const input = registerSchema.parse(req.body);
  const result = await authService.register(input);
  res.status(201).json(result);
}

export async function login(req: Request, res: Response) {
  const input = loginSchema.parse(req.body);
  const result = await authService.login(input);
  res.json(result);
}

export async function me(req: Request, res: Response) {
  const user = await authService.getProfile(currentUser(req).id);
  res.json({ user });
}

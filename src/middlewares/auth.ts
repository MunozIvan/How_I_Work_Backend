import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { HttpError } from '../utils/http-error.js';
import type { AuthUser, UserRole } from '../types/express.js';

interface TokenPayload {
  sub: string;
  role: UserRole;
}

export function signToken(user: AuthUser): string {
  return jwt.sign({ role: user.role }, env.JWT_SECRET, {
    subject: String(user.id),
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw HttpError.unauthorized('Missing or invalid Authorization header');
  }

  try {
    const payload = jwt.verify(header.slice(7), env.JWT_SECRET) as TokenPayload;
    req.user = { id: Number(payload.sub), role: payload.role };
    next();
  } catch {
    throw HttpError.unauthorized('Invalid or expired token');
  }
}

export function requireRole(role: UserRole) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) throw HttpError.unauthorized();
    if (req.user.role !== role) throw HttpError.forbidden('Insufficient permissions');
    next();
  };
}

export function currentUser(req: Request): AuthUser {
  if (!req.user) throw HttpError.unauthorized();
  return req.user;
}

import 'express';

export type UserRole = 'customer' | 'admin';

export interface AuthUser {
  id: number;
  role: UserRole;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters'), // bcrypt limit
  name: z.string().trim().min(1).max(120),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

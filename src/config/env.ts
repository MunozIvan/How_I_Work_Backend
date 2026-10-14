import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_USER: z.string().default('ecommerce'),
  DB_PASSWORD: z.string().default('ecommerce'),
  DB_NAME: z.string().default('ecommerce'),

  REDIS_URL: z.string().default('redis://localhost:6379/0'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('1h'),

  CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;

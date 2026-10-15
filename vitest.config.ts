import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Integration tests share one database, so run files sequentially
    fileParallelism: false,
    testTimeout: 15_000,
    env: {
      NODE_ENV: 'test',
      DB_HOST: process.env.DB_HOST ?? 'localhost',
      DB_PORT: process.env.DB_PORT ?? '3307',
      DB_USER: process.env.DB_USER ?? 'ecommerce',
      DB_PASSWORD: process.env.DB_PASSWORD ?? 'ecommerce',
      DB_NAME: process.env.DB_NAME ?? 'ecommerce_test',
      // Redis DB 1 so tests never touch development data in DB 0
      REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379/1',
      JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long',
    },
  },
});

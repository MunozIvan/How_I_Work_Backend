import bcrypt from 'bcryptjs';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/mysql.js';
import { redis } from '../src/db/redis.js';

export const app = createApp();

export async function resetDatabase(): Promise<void> {
  await pool.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of ['order_items', 'orders', 'products', 'categories', 'users']) {
    await pool.query(`TRUNCATE TABLE ${table}`);
  }
  await pool.query('SET FOREIGN_KEY_CHECKS = 1');
  await redis.flushdb();
}

export async function createAdminAndLogin(): Promise<string> {
  const email = 'admin@test.com';
  const password = 'Admin1234!';
  await pool.query(
    "INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, 'Admin', 'admin')",
    [email, await bcrypt.hash(password, 4)],
  );
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token as string;
}

export async function registerCustomer(email = 'customer@test.com'): Promise<string> {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'Password123', name: 'Test Customer' });
  return res.body.token as string;
}

export async function closeConnections(): Promise<void> {
  await pool.end();
  await redis.quit();
}

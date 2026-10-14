// npm run seed -> admin user + some categories and products. Can be run more than once.
import bcrypt from 'bcryptjs';
import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../db/mysql.js';
import { redis } from '../db/redis.js';
import { invalidateProductCache } from '../modules/products/products.service.js';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@example.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'Admin1234!';

const categories = [
  { name: 'Electronics', slug: 'electronics' },
  { name: 'Books', slug: 'books' },
  { name: 'Home', slug: 'home' },
];

const products = [
  { name: 'Mechanical Keyboard', description: 'Hot-swappable 75% keyboard', priceCents: 8999, stock: 25, category: 'electronics' },
  { name: 'Wireless Mouse', description: 'Ergonomic mouse with USB-C charging', priceCents: 3499, stock: 50, category: 'electronics' },
  { name: '27" 4K Monitor', description: 'IPS panel, 60Hz, HDR10', priceCents: 32999, stock: 10, category: 'electronics' },
  { name: 'Clean Code', description: 'A Handbook of Agile Software Craftsmanship', priceCents: 3999, stock: 40, category: 'books' },
  { name: 'Designing Data-Intensive Applications', description: 'The big ideas behind reliable, scalable systems', priceCents: 4599, stock: 30, category: 'books' },
  { name: 'Coffee Mug', description: '350ml ceramic mug', priceCents: 1299, stock: 100, category: 'home' },
  { name: 'Desk Lamp', description: 'LED lamp with adjustable brightness', priceCents: 2799, stock: 35, category: 'home' },
];

async function main() {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  await pool.query(
    `INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, 'Admin', 'admin')
     ON DUPLICATE KEY UPDATE role = 'admin'`,
    [ADMIN_EMAIL, passwordHash],
  );

  for (const c of categories) {
    await pool.query('INSERT IGNORE INTO categories (name, slug) VALUES (?, ?)', [c.name, c.slug]);
  }

  const [catRows] = await pool.query<RowDataPacket[]>('SELECT id, slug FROM categories');
  const catIds = new Map(catRows.map((r) => [r.slug as string, r.id as number]));

  const [[countRow]] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) AS total FROM products');
  if (Number(countRow?.total ?? 0) === 0) {
    for (const p of products) {
      await pool.query(
        'INSERT INTO products (name, description, price_cents, stock, category_id) VALUES (?, ?, ?, ?, ?)',
        [p.name, p.description, p.priceCents, p.stock, catIds.get(p.category) ?? null],
      );
    }
  }

  await invalidateProductCache();
  console.log(`Seed completed. Admin: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
    await redis.quit();
  });

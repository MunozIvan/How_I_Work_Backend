import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool } from '../../db/mysql.js';
import { redis } from '../../db/redis.js';
import { buildKey, getOrSet } from '../../utils/cache.js';
import { HttpError } from '../../utils/http-error.js';
import type {
  CreateCategoryInput,
  CreateProductInput,
  ListProductsQuery,
  UpdateProductInput,
} from './products.schemas.js';

// Cache invalidation: every key has a version number in it (products:v3:...).
// When something changes I just INCR the version and the old keys are never read
// again, they die with the TTL. Much simpler than finding and deleting keys.
const VERSION_KEY = 'products:cache-version';

async function cacheVersion(): Promise<string> {
  return (await redis.get(VERSION_KEY)) ?? '0';
}

export async function invalidateProductCache(): Promise<void> {
  await redis.incr(VERSION_KEY);
}

interface ProductRow extends RowDataPacket {
  id: number;
  name: string;
  description: string | null;
  price_cents: number;
  stock: number;
  is_active: number;
  created_at: Date;
  category_id: number | null;
  category_name: string | null;
  category_slug: string | null;
}

export interface Product {
  id: number;
  name: string;
  description: string | null;
  priceCents: number;
  stock: number;
  isActive: boolean;
  createdAt: string;
  category: { id: number; name: string; slug: string } | null;
}

function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    priceCents: row.price_cents,
    stock: row.stock,
    isActive: row.is_active === 1,
    createdAt: new Date(row.created_at).toISOString(),
    category:
      row.category_id !== null && row.category_name !== null && row.category_slug !== null
        ? { id: row.category_id, name: row.category_name, slug: row.category_slug }
        : null,
  };
}

const SELECT_PRODUCT = `
  SELECT p.id, p.name, p.description, p.price_cents, p.stock, p.is_active, p.created_at,
         c.id AS category_id, c.name AS category_name, c.slug AS category_slug
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id`;

const SORT_SQL: Record<ListProductsQuery['sort'], string> = {
  newest: 'p.created_at DESC, p.id DESC',
  price_asc: 'p.price_cents ASC, p.id ASC',
  price_desc: 'p.price_cents DESC, p.id DESC',
};

export async function listProducts(query: ListProductsQuery) {
  const key = buildKey(`products:v${await cacheVersion()}:list`, query);

  return getOrSet(key, async () => {
    const where: string[] = ['p.is_active = 1'];
    const params: unknown[] = [];

    if (query.search) {
      where.push('(p.name LIKE ? OR p.description LIKE ?)');
      params.push(`%${query.search}%`, `%${query.search}%`);
    }
    if (query.categoryId) {
      where.push('p.category_id = ?');
      params.push(query.categoryId);
    }
    if (query.minPrice !== undefined) {
      where.push('p.price_cents >= ?');
      params.push(query.minPrice);
    }
    if (query.maxPrice !== undefined) {
      where.push('p.price_cents <= ?');
      params.push(query.maxPrice);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const offset = (query.page - 1) * query.limit;

    const [rows] = await pool.query<ProductRow[]>(
      `${SELECT_PRODUCT} ${whereSql} ORDER BY ${SORT_SQL[query.sort]} LIMIT ? OFFSET ?`,
      [...params, query.limit, offset],
    );
    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM products p ${whereSql}`,
      params,
    );
    const total = Number(countRows[0]?.total ?? 0);

    return {
      data: rows.map(toProduct),
      meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
    };
  });
}

async function findProductById(id: number): Promise<Product | null> {
  const [rows] = await pool.query<ProductRow[]>(`${SELECT_PRODUCT} WHERE p.id = ?`, [id]);
  return rows[0] ? toProduct(rows[0]) : null;
}

export async function getProduct(id: number) {
  const { value, hit } = await getOrSet(`products:v${await cacheVersion()}:id:${id}`, async () => {
    const product = await findProductById(id);
    return product && product.isActive ? product : null;
  });
  if (!value) throw HttpError.notFound('Product not found');
  return { value, hit };
}

async function assertCategoryExists(categoryId: number | null | undefined): Promise<void> {
  if (categoryId === null || categoryId === undefined) return;
  const [rows] = await pool.query<RowDataPacket[]>('SELECT id FROM categories WHERE id = ?', [categoryId]);
  if (rows.length === 0) throw HttpError.badRequest(`Category ${categoryId} does not exist`);
}

export async function createProduct(input: CreateProductInput): Promise<Product> {
  await assertCategoryExists(input.categoryId);
  const [result] = await pool.query<ResultSetHeader>(
    'INSERT INTO products (name, description, price_cents, stock, category_id) VALUES (?, ?, ?, ?, ?)',
    [input.name, input.description ?? null, input.priceCents, input.stock, input.categoryId ?? null],
  );
  await invalidateProductCache();
  const product = await findProductById(result.insertId);
  if (!product) throw new Error('Product was not created');
  return product;
}

const UPDATABLE_COLUMNS: Record<keyof UpdateProductInput, string> = {
  name: 'name',
  description: 'description',
  priceCents: 'price_cents',
  stock: 'stock',
  categoryId: 'category_id',
  isActive: 'is_active',
};

export async function updateProduct(id: number, input: UpdateProductInput): Promise<Product> {
  await assertCategoryExists(input.categoryId);

  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [field, column] of Object.entries(UPDATABLE_COLUMNS) as [keyof UpdateProductInput, string][]) {
    const value = input[field];
    if (value !== undefined) {
      sets.push(`${column} = ?`);
      params.push(value);
    }
  }

  const [result] = await pool.query<ResultSetHeader>(`UPDATE products SET ${sets.join(', ')} WHERE id = ?`, [
    ...params,
    id,
  ]);
  if (result.affectedRows === 0) throw HttpError.notFound('Product not found');

  await invalidateProductCache();
  const product = await findProductById(id);
  if (!product) throw HttpError.notFound('Product not found');
  return product;
}

// soft delete, old orders still point to this product
export async function deleteProduct(id: number): Promise<void> {
  const [result] = await pool.query<ResultSetHeader>('UPDATE products SET is_active = 0 WHERE id = ?', [id]);
  if (result.affectedRows === 0) throw HttpError.notFound('Product not found');
  await invalidateProductCache();
}

// categories

interface CategoryRow extends RowDataPacket {
  id: number;
  name: string;
  slug: string;
}

export async function listCategories() {
  return getOrSet(`products:v${await cacheVersion()}:categories`, async () => {
    const [rows] = await pool.query<CategoryRow[]>('SELECT id, name, slug FROM categories ORDER BY name');
    return rows.map((r) => ({ id: r.id, name: r.name, slug: r.slug }));
  });
}

export async function createCategory(input: CreateCategoryInput) {
  try {
    const [result] = await pool.query<ResultSetHeader>('INSERT INTO categories (name, slug) VALUES (?, ?)', [
      input.name,
      input.slug,
    ]);
    await invalidateProductCache();
    return { id: result.insertId, ...input };
  } catch (err) {
    if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
      throw HttpError.conflict(`Category slug "${input.slug}" already exists`);
    }
    throw err;
  }
}

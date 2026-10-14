import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../../db/mysql.js';
import { redis } from '../../db/redis.js';
import { HttpError } from '../../utils/http-error.js';
import type { AddItemInput } from './cart.schemas.js';

// cart:{userId} -> hash { productId: quantity }
// Lives in Redis because it's temporary data: abandoned carts just expire.
const CART_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const MAX_QUANTITY = 100;

const cartKey = (userId: number) => `cart:${userId}`;

interface ProductStockRow extends RowDataPacket {
  id: number;
  name: string;
  price_cents: number;
  stock: number;
}

export interface CartItem {
  productId: number;
  name: string;
  unitPriceCents: number;
  quantity: number;
  subtotalCents: number;
  inStock: boolean;
}

export interface Cart {
  items: CartItem[];
  totalCents: number;
  itemCount: number;
}

export async function getRawCart(userId: number): Promise<Map<number, number>> {
  const hash = await redis.hgetall(cartKey(userId));
  return new Map(Object.entries(hash).map(([productId, qty]) => [Number(productId), Number(qty)]));
}

async function getActiveProduct(productId: number): Promise<ProductStockRow> {
  const [rows] = await pool.query<ProductStockRow[]>(
    'SELECT id, name, price_cents, stock FROM products WHERE id = ? AND is_active = 1',
    [productId],
  );
  const product = rows[0];
  if (!product) throw HttpError.notFound('Product not found');
  return product;
}

function assertStock(product: ProductStockRow, quantity: number): void {
  if (quantity > MAX_QUANTITY) {
    throw HttpError.badRequest(`Maximum quantity per product is ${MAX_QUANTITY}`);
  }
  if (quantity > product.stock) {
    throw HttpError.badRequest(`Only ${product.stock} units of "${product.name}" are available`);
  }
}

export async function getCart(userId: number): Promise<Cart> {
  const raw = await getRawCart(userId);
  if (raw.size === 0) return { items: [], totalCents: 0, itemCount: 0 };

  const [rows] = await pool.query<ProductStockRow[]>(
    'SELECT id, name, price_cents, stock FROM products WHERE id IN (?) AND is_active = 1',
    [[...raw.keys()]],
  );
  const products = new Map(rows.map((p) => [p.id, p]));

  // product got deactivated while it was sitting in the cart -> drop it
  const missing = [...raw.keys()].filter((id) => !products.has(id));
  if (missing.length > 0) {
    await redis.hdel(cartKey(userId), ...missing.map(String));
  }

  const items: CartItem[] = rows.map((p) => {
    const quantity = raw.get(p.id) ?? 0;
    return {
      productId: p.id,
      name: p.name,
      unitPriceCents: p.price_cents,
      quantity,
      subtotalCents: p.price_cents * quantity,
      inStock: quantity <= p.stock,
    };
  });

  return {
    items,
    totalCents: items.reduce((sum, i) => sum + i.subtotalCents, 0),
    itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
  };
}

export async function addItem(userId: number, input: AddItemInput): Promise<Cart> {
  const product = await getActiveProduct(input.productId);
  const current = Number((await redis.hget(cartKey(userId), String(input.productId))) ?? 0);
  assertStock(product, current + input.quantity);

  await redis
    .multi()
    .hincrby(cartKey(userId), String(input.productId), input.quantity)
    .expire(cartKey(userId), CART_TTL_SECONDS)
    .exec();
  return getCart(userId);
}

export async function setItemQuantity(userId: number, productId: number, quantity: number): Promise<Cart> {
  const exists = await redis.hexists(cartKey(userId), String(productId));
  if (!exists) throw HttpError.notFound('Product is not in the cart');

  const product = await getActiveProduct(productId);
  assertStock(product, quantity);

  await redis
    .multi()
    .hset(cartKey(userId), String(productId), quantity)
    .expire(cartKey(userId), CART_TTL_SECONDS)
    .exec();
  return getCart(userId);
}

export async function removeItem(userId: number, productId: number): Promise<Cart> {
  const removed = await redis.hdel(cartKey(userId), String(productId));
  if (removed === 0) throw HttpError.notFound('Product is not in the cart');
  return getCart(userId);
}

export async function clearCart(userId: number): Promise<void> {
  await redis.del(cartKey(userId));
}

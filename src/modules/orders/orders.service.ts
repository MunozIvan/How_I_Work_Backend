import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool, withTransaction } from '../../db/mysql.js';
import { redis } from '../../db/redis.js';
import { HttpError } from '../../utils/http-error.js';
import type { AuthUser } from '../../types/express.js';
import { clearCart, getRawCart } from '../cart/cart.service.js';
import { invalidateProductCache } from '../products/products.service.js';
import { STATUS_TRANSITIONS, type OrderStatus } from './orders.schemas.js';

interface LockedProductRow extends RowDataPacket {
  id: number;
  name: string;
  price_cents: number;
  stock: number;
}

interface OrderRow extends RowDataPacket {
  id: number;
  user_id: number;
  status: OrderStatus;
  total_cents: number;
  created_at: Date;
}

interface OrderItemRow extends RowDataPacket {
  order_id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price_cents: number;
}

export interface Order {
  id: number;
  userId: number;
  status: OrderStatus;
  totalCents: number;
  createdAt: string;
  items: {
    productId: number;
    name: string;
    quantity: number;
    unitPriceCents: number;
    subtotalCents: number;
  }[];
}

export async function checkout(userId: number): Promise<Order> {
  // double click on "buy" = two orders. This lock avoids that.
  const lockKey = `lock:checkout:${userId}`;
  const acquired = await redis.set(lockKey, '1', 'EX', 10, 'NX');
  if (acquired === null) throw HttpError.conflict('A checkout is already in progress');

  try {
    return await createOrderFromCart(userId);
  } finally {
    await redis.del(lockKey);
  }
}

async function createOrderFromCart(userId: number): Promise<Order> {
  const cart = await getRawCart(userId);
  if (cart.size === 0) throw HttpError.badRequest('Cart is empty');

  const orderId = await withTransaction(async (conn) => {
    // FOR UPDATE locks these rows until commit, so two people can't buy the last unit.
    // Always lock by id order, otherwise two checkouts can deadlock each other.
    const [products] = await conn.query<LockedProductRow[]>(
      'SELECT id, name, price_cents, stock FROM products WHERE id IN (?) AND is_active = 1 ORDER BY id FOR UPDATE',
      [[...cart.keys()]],
    );

    if (products.length !== cart.size) {
      throw HttpError.badRequest('Some products in the cart are no longer available');
    }

    const outOfStock = products.filter((p) => (cart.get(p.id) ?? 0) > p.stock);
    if (outOfStock.length > 0) {
      throw new HttpError(
        409,
        'Insufficient stock',
        outOfStock.map((p) => ({ productId: p.id, name: p.name, available: p.stock, requested: cart.get(p.id) })),
      );
    }

    // never trust prices coming from the client
    const totalCents = products.reduce((sum, p) => sum + p.price_cents * (cart.get(p.id) ?? 0), 0);

    const [orderResult] = await conn.query<ResultSetHeader>(
      'INSERT INTO orders (user_id, status, total_cents) VALUES (?, ?, ?)',
      [userId, 'pending', totalCents],
    );
    const newOrderId = orderResult.insertId;

    await conn.query('INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents) VALUES ?', [
      products.map((p) => [newOrderId, p.id, cart.get(p.id), p.price_cents]),
    ]);

    for (const p of products) {
      await conn.query('UPDATE products SET stock = stock - ? WHERE id = ?', [cart.get(p.id), p.id]);
    }

    return newOrderId;
  });

  // only after the commit worked
  await clearCart(userId);
  await invalidateProductCache();

  return getOrderById(orderId);
}

async function getOrderById(orderId: number): Promise<Order> {
  const [orders] = await pool.query<OrderRow[]>('SELECT * FROM orders WHERE id = ?', [orderId]);
  const order = orders[0];
  if (!order) throw HttpError.notFound('Order not found');

  const itemsByOrder = await loadItems([order.id]);
  return toOrder(order, itemsByOrder.get(order.id) ?? []);
}

async function loadItems(orderIds: number[]): Promise<Map<number, OrderItemRow[]>> {
  const map = new Map<number, OrderItemRow[]>();
  if (orderIds.length === 0) return map;

  const [items] = await pool.query<OrderItemRow[]>(
    `SELECT oi.order_id, oi.product_id, p.name AS product_name, oi.quantity, oi.unit_price_cents
     FROM order_items oi
     JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id IN (?)
     ORDER BY oi.id`,
    [orderIds],
  );
  for (const item of items) {
    const list = map.get(item.order_id) ?? [];
    list.push(item);
    map.set(item.order_id, list);
  }
  return map;
}

function toOrder(row: OrderRow, items: OrderItemRow[]): Order {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    totalCents: row.total_cents,
    createdAt: new Date(row.created_at).toISOString(),
    items: items.map((i) => ({
      productId: i.product_id,
      name: i.product_name,
      quantity: i.quantity,
      unitPriceCents: i.unit_price_cents,
      subtotalCents: i.unit_price_cents * i.quantity,
    })),
  };
}

export async function listOrders(userId: number): Promise<Order[]> {
  // 2 queries instead of 1 + N
  const [orders] = await pool.query<OrderRow[]>(
    'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 50',
    [userId],
  );
  const items = await loadItems(orders.map((o) => o.id));
  return orders.map((o) => toOrder(o, items.get(o.id) ?? []));
}

export async function getOrder(orderId: number, user: AuthUser): Promise<Order> {
  const order = await getOrderById(orderId);
  // 404 instead of 403: don't confirm that someone else's order exists
  if (user.role !== 'admin' && order.userId !== user.id) throw HttpError.notFound('Order not found');
  return order;
}

export async function updateStatus(orderId: number, status: OrderStatus): Promise<Order> {
  await withTransaction(async (conn) => {
    const [rows] = await conn.query<OrderRow[]>('SELECT * FROM orders WHERE id = ? FOR UPDATE', [orderId]);
    const order = rows[0];
    if (!order) throw HttpError.notFound('Order not found');

    if (!STATUS_TRANSITIONS[order.status].includes(status)) {
      throw HttpError.badRequest(`Cannot change order status from "${order.status}" to "${status}"`);
    }

    await conn.query('UPDATE orders SET status = ? WHERE id = ?', [status, orderId]);

    // give the stock back
    if (status === 'cancelled') {
      await conn.query(
        `UPDATE products p
         JOIN order_items oi ON oi.product_id = p.id
         SET p.stock = p.stock + oi.quantity
         WHERE oi.order_id = ?`,
        [orderId],
      );
    }
  });

  if (status === 'cancelled') await invalidateProductCache();
  return getOrderById(orderId);
}

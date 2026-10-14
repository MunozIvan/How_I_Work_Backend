import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { app, closeConnections, createAdminAndLogin, registerCustomer, resetDatabase } from './helpers.js';

let adminToken: string;
let customerToken: string;

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function createProduct(overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post('/api/products')
    .set(auth(adminToken))
    .send({ name: 'Keyboard', description: 'Mechanical', priceCents: 5000, stock: 5, ...overrides });
  expect(res.status).toBe(201);
  return res.body as { id: number; stock: number; priceCents: number };
}

beforeEach(async () => {
  await resetDatabase();
  adminToken = await createAdminAndLogin();
  customerToken = await registerCustomer();
});

afterAll(async () => {
  await closeConnections();
});

describe('Health', () => {
  it('reports MySQL and Redis as up', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.services).toEqual({ mysql: 'up', redis: 'up' });
  });
});

describe('Auth', () => {
  it('registers a user and returns a token', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'NEW@test.com', password: 'Password123', name: 'New' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTypeOf('string');
    expect(res.body.user).toMatchObject({ email: 'new@test.com', role: 'customer' });
    expect(res.body.user.password_hash).toBeUndefined();
  });

  it('rejects duplicated emails', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'customer@test.com', password: 'Password123', name: 'Dup' });
    expect(res.status).toBe(409);
  });

  it('validates the request body', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'not-an-email', password: '1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation error');
  });

  it('rejects wrong credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'customer@test.com', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('returns the current user with a valid token', async () => {
    const res = await request(app).get('/api/auth/me').set(auth(customerToken));
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('customer@test.com');
  });

  it('rate limits repeated login attempts', async () => {
    let last = 0;
    for (let i = 0; i < 12; i++) {
      const res = await request(app).post('/api/auth/login').send({ email: 'x@test.com', password: 'x' });
      last = res.status;
    }
    expect(last).toBe(429);
  });
});

describe('Products', () => {
  it('only lets admins create products', async () => {
    const res = await request(app)
      .post('/api/products')
      .set(auth(customerToken))
      .send({ name: 'X', priceCents: 100 });
    expect(res.status).toBe(403);
  });

  it('caches product lists in Redis and invalidates on write', async () => {
    await createProduct({ name: 'Mouse' });

    const first = await request(app).get('/api/products');
    expect(first.headers['x-cache']).toBe('MISS');
    expect(first.body.meta.total).toBe(1);

    const second = await request(app).get('/api/products');
    expect(second.headers['x-cache']).toBe('HIT');

    await createProduct({ name: 'Monitor' });
    const third = await request(app).get('/api/products');
    expect(third.headers['x-cache']).toBe('MISS');
    expect(third.body.meta.total).toBe(2);
  });

  it('filters, sorts and paginates', async () => {
    await createProduct({ name: 'Cheap mouse', priceCents: 1000 });
    await createProduct({ name: 'Expensive mouse', priceCents: 9000 });
    await createProduct({ name: 'Monitor', priceCents: 20000 });

    const res = await request(app).get('/api/products?search=mouse&sort=price_desc&limit=1');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Expensive mouse');
    expect(res.body.meta).toEqual({ page: 1, limit: 1, total: 2, totalPages: 2 });
  });

  it('hides soft-deleted products', async () => {
    const product = await createProduct();
    const del = await request(app).delete(`/api/products/${product.id}`).set(auth(adminToken));
    expect(del.status).toBe(204);

    const res = await request(app).get(`/api/products/${product.id}`);
    expect(res.status).toBe(404);
  });
});

describe('Cart and checkout', () => {
  it('adds items, computes totals and checks out', async () => {
    const product = await createProduct({ priceCents: 2500, stock: 5 });

    const add = await request(app)
      .post('/api/cart/items')
      .set(auth(customerToken))
      .send({ productId: product.id, quantity: 2 });
    expect(add.status).toBe(201);
    expect(add.body.totalCents).toBe(5000);

    const order = await request(app).post('/api/orders').set(auth(customerToken));
    expect(order.status).toBe(201);
    expect(order.body).toMatchObject({ status: 'pending', totalCents: 5000 });
    expect(order.body.items).toHaveLength(1);

    const after = await request(app).get(`/api/products/${product.id}`);
    expect(after.body.stock).toBe(3);
    const cart = await request(app).get('/api/cart').set(auth(customerToken));
    expect(cart.body.items).toHaveLength(0);
  });

  it('does not allow adding more than the available stock', async () => {
    const product = await createProduct({ stock: 1 });
    const res = await request(app)
      .post('/api/cart/items')
      .set(auth(customerToken))
      .send({ productId: product.id, quantity: 2 });
    expect(res.status).toBe(400);
  });

  it('rejects checkout if stock ran out after adding to cart', async () => {
    const product = await createProduct({ stock: 2 });
    await request(app)
      .post('/api/cart/items')
      .set(auth(customerToken))
      .send({ productId: product.id, quantity: 2 });

    await request(app).patch(`/api/products/${product.id}`).set(auth(adminToken)).send({ stock: 1 });

    const res = await request(app).post('/api/orders').set(auth(customerToken));
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Insufficient stock');
  });

  it('restores stock when an order is cancelled', async () => {
    const product = await createProduct({ stock: 3 });
    await request(app)
      .post('/api/cart/items')
      .set(auth(customerToken))
      .send({ productId: product.id, quantity: 3 });
    const order = await request(app).post('/api/orders').set(auth(customerToken));

    const cancel = await request(app)
      .patch(`/api/orders/${order.body.id}/status`)
      .set(auth(adminToken))
      .send({ status: 'cancelled' });
    expect(cancel.status).toBe(200);

    const after = await request(app).get(`/api/products/${product.id}`);
    expect(after.body.stock).toBe(3);
  });

  it("does not expose other users' orders", async () => {
    const product = await createProduct();
    await request(app).post('/api/cart/items').set(auth(customerToken)).send({ productId: product.id });
    const order = await request(app).post('/api/orders').set(auth(customerToken));

    const otherToken = await registerCustomer('other@test.com');
    const res = await request(app).get(`/api/orders/${order.body.id}`).set(auth(otherToken));
    expect(res.status).toBe(404);
  });
});

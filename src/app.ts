import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pool } from './db/mysql.js';
import { redis } from './db/redis.js';
import { errorHandler, notFoundHandler } from './middlewares/error-handler.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { cartRouter } from './modules/cart/cart.routes.js';
import { ordersRouter } from './modules/orders/orders.routes.js';
import { categoriesRouter, productsRouter } from './modules/products/products.routes.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1); // real client IP behind nginx/a load balancer, the rate limiter needs it
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', async (_req, res) => {
    const [mysqlOk, redisOk] = await Promise.all([
      pool.query('SELECT 1').then(() => true, () => false),
      redis.ping().then(() => true, () => false),
    ]);
    const healthy = mysqlOk && redisOk;
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      services: { mysql: mysqlOk ? 'up' : 'down', redis: redisOk ? 'up' : 'down' },
    });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/products', productsRouter);
  app.use('/api/categories', categoriesRouter);
  app.use('/api/cart', cartRouter);
  app.use('/api/orders', ordersRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

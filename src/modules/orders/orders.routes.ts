import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import * as ordersController from './orders.controller.js';

export const ordersRouter = Router();

ordersRouter.use(requireAuth);

ordersRouter.post('/', ordersController.checkout); // checkout: cart -> order
ordersRouter.get('/', ordersController.list);
ordersRouter.get('/:id', ordersController.getById);
ordersRouter.patch('/:id/status', requireRole('admin'), ordersController.updateStatus);

import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import * as cartController from './cart.controller.js';

export const cartRouter = Router();

cartRouter.use(requireAuth);

cartRouter.get('/', cartController.get);
cartRouter.post('/items', cartController.addItem);
cartRouter.patch('/items/:productId', cartController.updateItem);
cartRouter.delete('/items/:productId', cartController.removeItem);
cartRouter.delete('/', cartController.clear);

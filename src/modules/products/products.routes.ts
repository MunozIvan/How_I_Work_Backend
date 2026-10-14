import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import * as productsController from './products.controller.js';

export const productsRouter = Router();
export const categoriesRouter = Router();

const adminOnly = [requireAuth, requireRole('admin')];

productsRouter.get('/', productsController.list);
productsRouter.get('/:id', productsController.getById);
productsRouter.post('/', ...adminOnly, productsController.create);
productsRouter.patch('/:id', ...adminOnly, productsController.update);
productsRouter.delete('/:id', ...adminOnly, productsController.remove);

categoriesRouter.get('/', productsController.listCategories);
categoriesRouter.post('/', ...adminOnly, productsController.createCategory);

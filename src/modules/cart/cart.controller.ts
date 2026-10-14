import type { Request, Response } from 'express';
import { currentUser } from '../../middlewares/auth.js';
import { addItemSchema, productIdParamSchema, updateItemSchema } from './cart.schemas.js';
import * as cartService from './cart.service.js';

export async function get(req: Request, res: Response) {
  res.json(await cartService.getCart(currentUser(req).id));
}

export async function addItem(req: Request, res: Response) {
  const input = addItemSchema.parse(req.body);
  res.status(201).json(await cartService.addItem(currentUser(req).id, input));
}

export async function updateItem(req: Request, res: Response) {
  const { productId } = productIdParamSchema.parse(req.params);
  const { quantity } = updateItemSchema.parse(req.body);
  res.json(await cartService.setItemQuantity(currentUser(req).id, productId, quantity));
}

export async function removeItem(req: Request, res: Response) {
  const { productId } = productIdParamSchema.parse(req.params);
  res.json(await cartService.removeItem(currentUser(req).id, productId));
}

export async function clear(req: Request, res: Response) {
  await cartService.clearCart(currentUser(req).id);
  res.status(204).end();
}

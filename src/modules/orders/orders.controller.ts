import type { Request, Response } from 'express';
import { currentUser } from '../../middlewares/auth.js';
import { orderIdParamSchema, updateStatusSchema } from './orders.schemas.js';
import * as ordersService from './orders.service.js';

export async function checkout(req: Request, res: Response) {
  const order = await ordersService.checkout(currentUser(req).id);
  res.status(201).json(order);
}

export async function list(req: Request, res: Response) {
  res.json(await ordersService.listOrders(currentUser(req).id));
}

export async function getById(req: Request, res: Response) {
  const { id } = orderIdParamSchema.parse(req.params);
  res.json(await ordersService.getOrder(id, currentUser(req)));
}

export async function updateStatus(req: Request, res: Response) {
  const { id } = orderIdParamSchema.parse(req.params);
  const { status } = updateStatusSchema.parse(req.body);
  res.json(await ordersService.updateStatus(id, status));
}

import { z } from 'zod';

export const ORDER_STATUSES = ['pending', 'paid', 'shipped', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const orderIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const updateStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
});

export const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['paid', 'cancelled'],
  paid: ['shipped', 'cancelled'],
  shipped: [],
  cancelled: [],
};

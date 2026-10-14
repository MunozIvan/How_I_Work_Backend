import { z } from 'zod';

export const addItemSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().min(1).max(100).default(1),
});

export const updateItemSchema = z.object({
  quantity: z.number().int().min(1).max(100),
});

export const productIdParamSchema = z.object({
  productId: z.coerce.number().int().positive(),
});

export type AddItemInput = z.infer<typeof addItemSchema>;

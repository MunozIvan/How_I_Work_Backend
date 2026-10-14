import { z } from 'zod';

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const listProductsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().min(1).max(100).optional(),
    categoryId: z.coerce.number().int().positive().optional(),
    minPrice: z.coerce.number().int().min(0).optional(),
    maxPrice: z.coerce.number().int().min(0).optional(),
    sort: z.enum(['newest', 'price_asc', 'price_desc']).default('newest'),
  })
  .refine((q) => q.minPrice === undefined || q.maxPrice === undefined || q.minPrice <= q.maxPrice, {
    message: 'minPrice must be less than or equal to maxPrice',
    path: ['minPrice'],
  });

export const createProductSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).nullish(),
  priceCents: z.number().int().positive(),
  stock: z.number().int().min(0).default(0),
  categoryId: z.number().int().positive().nullish(),
});

export const updateProductSchema = createProductSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field is required' });

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase letters, numbers and dashes'),
});

export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

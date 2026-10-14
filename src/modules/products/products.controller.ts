import type { Request, Response } from 'express';
import {
  createCategorySchema,
  createProductSchema,
  idParamSchema,
  listProductsQuerySchema,
  updateProductSchema,
} from './products.schemas.js';
import * as productsService from './products.service.js';

export async function list(req: Request, res: Response) {
  const query = listProductsQuerySchema.parse(req.query);
  const { value, hit } = await productsService.listProducts(query);
  res.setHeader('X-Cache', hit ? 'HIT' : 'MISS');
  res.json(value);
}

export async function getById(req: Request, res: Response) {
  const { id } = idParamSchema.parse(req.params);
  const { value, hit } = await productsService.getProduct(id);
  res.setHeader('X-Cache', hit ? 'HIT' : 'MISS');
  res.json(value);
}

export async function create(req: Request, res: Response) {
  const input = createProductSchema.parse(req.body);
  const product = await productsService.createProduct(input);
  res.status(201).json(product);
}

export async function update(req: Request, res: Response) {
  const { id } = idParamSchema.parse(req.params);
  const input = updateProductSchema.parse(req.body);
  const product = await productsService.updateProduct(id, input);
  res.json(product);
}

export async function remove(req: Request, res: Response) {
  const { id } = idParamSchema.parse(req.params);
  await productsService.deleteProduct(id);
  res.status(204).end();
}

// categories

export async function listCategories(_req: Request, res: Response) {
  const { value, hit } = await productsService.listCategories();
  res.setHeader('X-Cache', hit ? 'HIT' : 'MISS');
  res.json(value);
}

export async function createCategory(req: Request, res: Response) {
  const input = createCategorySchema.parse(req.body);
  const category = await productsService.createCategory(input);
  res.status(201).json(category);
}

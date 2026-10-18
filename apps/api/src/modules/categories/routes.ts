import {
  CategoryIdParamsSchema,
  CreateCategoryRequestSchema,
  DeleteCategoryQuerySchema,
  ListCategoriesQuerySchema,
  UpdateCategoryRequestSchema,
} from '@midas/shared';
import type { FastifyInstance } from 'fastify';
import { parseInput } from '../../platform/validation.js';
import { requireAuth } from '../auth/guard.js';
import type { CategoryService } from './service.js';

/** Registered inside the guarded scope. System categories are read-only for every user. */
export function categoryRoutes(app: FastifyInstance, service: CategoryService): void {
  app.get('/api/v1/categories', async (request) => {
    const query = parseInput(ListCategoriesQuerySchema, request.query);
    return { items: await service.list(requireAuth(request).userId, query) };
  });

  app.post('/api/v1/categories', async (request, reply) => {
    const body = parseInput(CreateCategoryRequestSchema, request.body);
    return reply.code(201).send(await service.create(requireAuth(request).userId, body));
  });

  app.patch('/api/v1/categories/:categoryId', async (request) => {
    const { categoryId } = parseInput(CategoryIdParamsSchema, request.params);
    const body = parseInput(UpdateCategoryRequestSchema, request.body);
    return service.update(requireAuth(request).userId, categoryId, body);
  });

  app.delete('/api/v1/categories/:categoryId', async (request) => {
    const { categoryId } = parseInput(CategoryIdParamsSchema, request.params);
    const { reassignTo } = parseInput(DeleteCategoryQuerySchema, request.query);
    return service.remove(requireAuth(request).userId, categoryId, reassignTo);
  });
}

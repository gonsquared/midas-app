import {
  CategoryIdParamsSchema,
  CreateCategoryRequestSchema,
  ListAdminCategoriesQuerySchema,
  UpdateCategoryRequestSchema,
} from '@midas/shared';
import type { FastifyInstance } from 'fastify';
import { parseInput } from '../../platform/validation.js';
import { auditContext } from '../audit/service.js';
import { requireAuth } from '../auth/guard.js';
import type { AdminCategoryService } from './categories-service.js';

/** Registered inside the admin scope. Only system categories are reachable here. */
export function adminCategoryRoutes(app: FastifyInstance, service: AdminCategoryService): void {
  app.get('/api/v1/admin/categories', async (request) => {
    const query = parseInput(ListAdminCategoriesQuerySchema, request.query);
    return { items: await service.list(query) };
  });

  app.post('/api/v1/admin/categories', async (request, reply) => {
    const body = parseInput(CreateCategoryRequestSchema, request.body);
    const created = await service.create(requireAuth(request), body, auditContext(request));
    return reply.code(201).send(created);
  });

  app.patch('/api/v1/admin/categories/:categoryId', async (request) => {
    const { categoryId } = parseInput(CategoryIdParamsSchema, request.params);
    const body = parseInput(UpdateCategoryRequestSchema, request.body);
    return service.update(requireAuth(request), categoryId, body, auditContext(request));
  });

  app.post('/api/v1/admin/categories/:categoryId/retire', async (request) => {
    const { categoryId } = parseInput(CategoryIdParamsSchema, request.params);
    return service.retire(requireAuth(request), categoryId, auditContext(request));
  });

  app.post('/api/v1/admin/categories/:categoryId/restore', async (request) => {
    const { categoryId } = parseInput(CategoryIdParamsSchema, request.params);
    return service.restore(requireAuth(request), categoryId, auditContext(request));
  });
}

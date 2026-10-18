import {
  BudgetDateQuerySchema,
  BudgetIdParamsSchema,
  CreateBudgetRequestSchema,
  UpdateBudgetRequestSchema,
} from '@midas/shared';
import type { FastifyInstance } from 'fastify';
import { parseInput } from '../../platform/validation.js';
import { requireAuth } from '../auth/guard.js';
import type { BudgetService } from './service.js';

/** Registered inside the guarded scope. Every call is scoped to the authenticated user. */
export function budgetRoutes(app: FastifyInstance, service: BudgetService): void {
  app.get('/api/v1/budgets', async (request) => {
    const { date } = parseInput(BudgetDateQuerySchema, request.query);
    return service.list(requireAuth(request), date);
  });

  app.post('/api/v1/budgets', async (request, reply) => {
    const body = parseInput(CreateBudgetRequestSchema, request.body);
    return reply.code(201).send(await service.create(requireAuth(request), body));
  });

  app.get('/api/v1/budgets/:budgetId', async (request) => {
    const { budgetId } = parseInput(BudgetIdParamsSchema, request.params);
    const { date } = parseInput(BudgetDateQuerySchema, request.query);
    return service.get(requireAuth(request), budgetId, date);
  });

  app.patch('/api/v1/budgets/:budgetId', async (request) => {
    const { budgetId } = parseInput(BudgetIdParamsSchema, request.params);
    const body = parseInput(UpdateBudgetRequestSchema, request.body);
    return service.update(requireAuth(request), budgetId, body);
  });

  app.delete('/api/v1/budgets/:budgetId', async (request, reply) => {
    const { budgetId } = parseInput(BudgetIdParamsSchema, request.params);
    await service.remove(requireAuth(request).userId, budgetId);
    return reply.code(204).send();
  });
}

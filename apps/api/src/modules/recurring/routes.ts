import {
  CreateRecurringTemplateRequestSchema,
  ListRecurringQuerySchema,
  ListRunsQuerySchema,
  PreviewRecurringRequestSchema,
  TemplateIdParamsSchema,
  UpdateRecurringTemplateRequestSchema,
} from '@midas/shared';
import type { FastifyInstance } from 'fastify';
import { parseInput } from '../../platform/validation.js';
import { requireAuth } from '../auth/guard.js';
import type { RecurringService } from './service.js';

/**
 * Registered inside the guarded scope. `/preview` is registered before `/:templateId`
 * (api-contract 16). Every call is scoped to the authenticated user.
 */
export function recurringRoutes(app: FastifyInstance, service: RecurringService): void {
  app.get('/api/v1/recurring-templates', async (request) => {
    const query = parseInput(ListRecurringQuerySchema, request.query);
    return { items: await service.list(requireAuth(request).userId, query) };
  });

  app.post('/api/v1/recurring-templates', async (request, reply) => {
    const body = parseInput(CreateRecurringTemplateRequestSchema, request.body);
    return reply.code(201).send(await service.create(requireAuth(request), body));
  });

  app.post('/api/v1/recurring-templates/preview', async (request) => {
    const body = parseInput(PreviewRecurringRequestSchema, request.body);
    return service.preview(requireAuth(request), body);
  });

  app.get('/api/v1/recurring-templates/:templateId', async (request) => {
    const { templateId } = parseInput(TemplateIdParamsSchema, request.params);
    return service.get(requireAuth(request).userId, templateId);
  });

  app.patch('/api/v1/recurring-templates/:templateId', async (request) => {
    const { templateId } = parseInput(TemplateIdParamsSchema, request.params);
    const body = parseInput(UpdateRecurringTemplateRequestSchema, request.body);
    return service.update(requireAuth(request), templateId, body);
  });

  app.post('/api/v1/recurring-templates/:templateId/pause', async (request) => {
    const { templateId } = parseInput(TemplateIdParamsSchema, request.params);
    return service.pause(requireAuth(request).userId, templateId);
  });

  app.post('/api/v1/recurring-templates/:templateId/resume', async (request) => {
    const { templateId } = parseInput(TemplateIdParamsSchema, request.params);
    return service.resume(requireAuth(request), templateId);
  });

  app.delete('/api/v1/recurring-templates/:templateId', async (request, reply) => {
    const { templateId } = parseInput(TemplateIdParamsSchema, request.params);
    await service.remove(requireAuth(request).userId, templateId);
    return reply.code(204).send();
  });

  app.get('/api/v1/recurring-templates/:templateId/runs', async (request) => {
    const { templateId } = parseInput(TemplateIdParamsSchema, request.params);
    const query = parseInput(ListRunsQuerySchema, request.query);
    return service.runs(requireAuth(request).userId, templateId, query);
  });
}

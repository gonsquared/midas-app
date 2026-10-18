import { CategoryBreakdownQuerySchema, SummaryQuerySchema, TrendQuerySchema } from '@midas/shared';
import type { FastifyInstance } from 'fastify';
import { parseInput } from '../../platform/validation.js';
import { requireAuth } from '../auth/guard.js';
import type { ReportService } from './service.js';

/** Registered inside the guarded scope. Reports only ever read the caller's own ledger. */
export function reportRoutes(app: FastifyInstance, service: ReportService): void {
  app.get('/api/v1/reports/summary', async (request) => {
    const query = parseInput(SummaryQuerySchema, request.query);
    return service.summary(requireAuth(request), query);
  });

  app.get('/api/v1/reports/trend', async (request) => {
    const query = parseInput(TrendQuerySchema, request.query);
    return service.trend(requireAuth(request), query);
  });

  app.get('/api/v1/reports/category-breakdown', async (request) => {
    const query = parseInput(CategoryBreakdownQuerySchema, request.query);
    return service.categoryBreakdown(requireAuth(request), query);
  });
}

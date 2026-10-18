import { ListAuditLogsQuerySchema } from '@midas/shared';
import type { FastifyInstance } from 'fastify';
import { parseInput } from '../../platform/validation.js';
import type { AuditService } from './service.js';

/** Registered inside the admin scope. There is no create, update or delete route for audit rows. */
export function auditRoutes(app: FastifyInstance, service: AuditService): void {
  app.get('/api/v1/admin/audit-logs', async (request) => {
    const query = parseInput(ListAuditLogsQuerySchema, request.query);
    return service.list(query);
  });
}

import {
  ChangeRoleRequestSchema,
  ListAdminUsersQuerySchema,
  SuspendUserRequestSchema,
  UserIdParamsSchema,
} from '@midas/shared';
import type { FastifyInstance } from 'fastify';
import { parseInput } from '../../platform/validation.js';
import { auditContext } from '../audit/service.js';
import { requireAuth } from '../auth/guard.js';
import type { AdminUsersService } from './users-service.js';

/**
 * Registered inside the admin scope. No route here returns wallets, transactions, budgets or
 * templates of any user (ADR-018).
 */
export function adminUserRoutes(app: FastifyInstance, service: AdminUsersService): void {
  app.get('/api/v1/admin/users', async (request) => {
    return service.list(parseInput(ListAdminUsersQuerySchema, request.query));
  });

  app.get('/api/v1/admin/users/:userId', async (request) => {
    const { userId } = parseInput(UserIdParamsSchema, request.params);
    return service.get(userId);
  });

  app.post('/api/v1/admin/users/:userId/suspend', async (request) => {
    const { userId } = parseInput(UserIdParamsSchema, request.params);
    // The body is optional: a bodyless POST arrives as undefined.
    const { reason } = parseInput(SuspendUserRequestSchema, request.body ?? {});
    return service.suspend(requireAuth(request), userId, reason, auditContext(request));
  });

  app.post('/api/v1/admin/users/:userId/reactivate', async (request) => {
    const { userId } = parseInput(UserIdParamsSchema, request.params);
    return service.reactivate(requireAuth(request), userId, auditContext(request));
  });

  app.patch('/api/v1/admin/users/:userId/role', async (request) => {
    const { userId } = parseInput(UserIdParamsSchema, request.params);
    const { role } = parseInput(ChangeRoleRequestSchema, request.body);
    return service.changeRole(requireAuth(request), userId, role, auditContext(request));
  });
}

import {
  CreateWalletRequestSchema,
  ListWalletsQuerySchema,
  UpdateWalletRequestSchema,
  WalletIdParamsSchema,
} from '@midas/shared';
import type { FastifyInstance } from 'fastify';
import { parseInput } from '../../platform/validation.js';
import { requireAuth } from '../auth/guard.js';
import type { WalletService } from './service.js';

/** Registered inside the guarded scope. Every call is scoped to the authenticated user. */
export function walletRoutes(app: FastifyInstance, service: WalletService): void {
  app.get('/api/v1/wallets', async (request) => {
    const query = parseInput(ListWalletsQuerySchema, request.query);
    return { items: await service.list(requireAuth(request).userId, query.includeArchived) };
  });

  app.post('/api/v1/wallets', async (request, reply) => {
    const body = parseInput(CreateWalletRequestSchema, request.body);
    return reply.code(201).send(await service.create(requireAuth(request), body));
  });

  app.get('/api/v1/wallets/:walletId', async (request) => {
    const { walletId } = parseInput(WalletIdParamsSchema, request.params);
    return service.get(requireAuth(request).userId, walletId);
  });

  app.patch('/api/v1/wallets/:walletId', async (request) => {
    const { walletId } = parseInput(WalletIdParamsSchema, request.params);
    const body = parseInput(UpdateWalletRequestSchema, request.body);
    return service.update(requireAuth(request).userId, walletId, body);
  });

  app.post('/api/v1/wallets/:walletId/archive', async (request) => {
    const { walletId } = parseInput(WalletIdParamsSchema, request.params);
    return service.archive(requireAuth(request).userId, walletId);
  });

  app.post('/api/v1/wallets/:walletId/unarchive', async (request) => {
    const { walletId } = parseInput(WalletIdParamsSchema, request.params);
    return service.unarchive(requireAuth(request).userId, walletId);
  });

  app.delete('/api/v1/wallets/:walletId', async (request, reply) => {
    const { walletId } = parseInput(WalletIdParamsSchema, request.params);
    await service.remove(requireAuth(request).userId, walletId);
    return reply.code(204).send();
  });
}

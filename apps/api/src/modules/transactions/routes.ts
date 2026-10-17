import {
  CreateTransactionRequestSchema,
  ListTransactionsQuerySchema,
  TransactionIdParamsSchema,
  UpdateTransactionRequestSchema,
} from '@midas/shared';
import type { FastifyInstance } from 'fastify';
import { parseInput } from '../../platform/validation.js';
import { requireAuth } from '../auth/guard.js';
import type { TransactionService } from './service.js';

/**
 * Registered inside the guarded scope. CSV export (`GET /transactions/export`) belongs to E7 and
 * must be registered before the `:transactionId` routes below.
 */
export function transactionRoutes(app: FastifyInstance, service: TransactionService): void {
  app.get('/api/v1/transactions', async (request) => {
    const query = parseInput(ListTransactionsQuerySchema, request.query);
    return service.list(requireAuth(request).userId, query);
  });

  app.post('/api/v1/transactions', async (request, reply) => {
    const body = parseInput(CreateTransactionRequestSchema, request.body);
    return reply.code(201).send(await service.create(requireAuth(request).userId, body));
  });

  app.get('/api/v1/transactions/:transactionId', async (request) => {
    const { transactionId } = parseInput(TransactionIdParamsSchema, request.params);
    return service.get(requireAuth(request).userId, transactionId);
  });

  app.patch('/api/v1/transactions/:transactionId', async (request) => {
    const { transactionId } = parseInput(TransactionIdParamsSchema, request.params);
    const body = parseInput(UpdateTransactionRequestSchema, request.body);
    return service.update(requireAuth(request).userId, transactionId, body);
  });

  app.delete('/api/v1/transactions/:transactionId', async (request, reply) => {
    const { transactionId } = parseInput(TransactionIdParamsSchema, request.params);
    await service.remove(requireAuth(request).userId, transactionId);
    return reply.code(204).send();
  });
}

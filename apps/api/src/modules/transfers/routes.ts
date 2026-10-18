import {
  CreateTransferRequestSchema,
  TransferIdParamsSchema,
  UpdateTransferRequestSchema,
} from '@midas/shared';
import type { FastifyInstance } from 'fastify';
import { parseInput } from '../../platform/validation.js';
import { requireAuth } from '../auth/guard.js';
import type { TransferService } from './service.js';

/** Registered inside the guarded scope. */
export function transferRoutes(app: FastifyInstance, service: TransferService): void {
  app.post('/api/v1/transfers', async (request, reply) => {
    const body = parseInput(CreateTransferRequestSchema, request.body);
    return reply.code(201).send(await service.create(requireAuth(request).userId, body));
  });

  app.get('/api/v1/transfers/:transferId', async (request) => {
    const { transferId } = parseInput(TransferIdParamsSchema, request.params);
    return service.get(requireAuth(request).userId, transferId);
  });

  app.patch('/api/v1/transfers/:transferId', async (request) => {
    const { transferId } = parseInput(TransferIdParamsSchema, request.params);
    const body = parseInput(UpdateTransferRequestSchema, request.body);
    return service.update(requireAuth(request).userId, transferId, body);
  });

  app.delete('/api/v1/transfers/:transferId', async (request, reply) => {
    const { transferId } = parseInput(TransferIdParamsSchema, request.params);
    await service.remove(requireAuth(request).userId, transferId);
    return reply.code(204).send();
  });
}

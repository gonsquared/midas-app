import {
  CreateTransactionRequestSchema,
  dateInTimeZone,
  ExportTransactionsQuerySchema,
  ListTransactionsQuerySchema,
  TransactionIdParamsSchema,
  UpdateTransactionRequestSchema,
} from '@midas/shared';
import type { FastifyInstance } from 'fastify';
import type { Clock } from '../../platform/clock.js';
import { AppError } from '../../platform/errors.js';
import { createLimiter } from '../../platform/rate-limit.js';
import { parseInput } from '../../platform/validation.js';
import { requireAuth } from '../auth/guard.js';
import { ExportGate } from './export.js';
import type { TransactionService } from './service.js';

export interface TransactionRoutesOptions {
  clock: Clock;
  /** Exports per user per minute (architecture 9: 10). */
  exportMax: number;
  /** Concurrent exports per process, so downloads cannot drain the connection pool. */
  exportConcurrency?: number;
  /** Absolute time cap per export, in milliseconds. */
  exportMaxDurationMs?: number;
  rateLimitKeys?: number;
}

/** Registered inside the guarded scope. */
export function transactionRoutes(
  app: FastifyInstance,
  service: TransactionService,
  options: TransactionRoutesOptions,
): void {
  const exportLimiter = createLimiter(app, {
    name: 'transactions-export',
    max: options.exportMax,
    windowSeconds: 60,
    key: (request) => requireAuth(request).userId,
    ...(options.rateLimitKeys !== undefined && { maxKeys: options.rateLimitKeys }),
  });
  const gate = new ExportGate({
    max: options.exportConcurrency ?? 3,
    perUser: 1,
    ...(options.exportMaxDurationMs !== undefined && {
      maxDurationMs: options.exportMaxDurationMs,
    }),
  });

  app.get('/api/v1/transactions', async (request) => {
    const query = parseInput(ListTransactionsQuerySchema, request.query);
    return service.list(requireAuth(request).userId, query);
  });

  app.post('/api/v1/transactions', async (request, reply) => {
    const body = parseInput(CreateTransactionRequestSchema, request.body);
    return reply.code(201).send(await service.create(requireAuth(request).userId, body));
  });

  // Registered before `:transactionId`, so "export" is never read as an id (api-contract 16).
  app.get('/api/v1/transactions/export', async (request, reply) => {
    await exportLimiter(request, reply);
    const query = parseInput(ExportTransactionsQuerySchema, request.query);
    const auth = requireAuth(request);
    // Absolute time cap: past it the stream and the socket are destroyed (see below).
    const running: { stream?: ReturnType<TransactionService['exportCsv']> } = {};
    const release = gate.acquire(auth.userId, () => {
      request.log.warn({ userId: auth.userId }, 'transaction export exceeded its time cap');
      running.stream?.destroy(new Error('export time cap exceeded'));
    });
    if (!release) {
      throw new AppError(
        'RATE_LIMITED',
        'An export is already running or too many exports are running. Try again shortly.',
        { retryAfterSeconds: 5 },
      );
    }
    const stream = service.exportCsv(auth.userId, query);
    running.stream = stream;
    // Frees the slot when the response ends or the client goes away.
    reply.raw.once('close', release);
    stream.once('error', (error) => {
      request.log.error({ err: error }, 'transaction export failed');
      // Headers (200) are already sent, so the status cannot change. Destroying the socket makes
      // the client see an aborted, truncated response instead of a clean 200 with a short file.
      if (reply.raw.headersSent) reply.raw.destroy();
    });
    const day = dateInTimeZone(options.clock.now(), auth.preferences.timezone).replaceAll('-', '');
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="midas-transactions-${day}.csv"`)
      .header('Cache-Control', 'no-store')
      .send(stream);
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

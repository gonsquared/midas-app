import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { AppError } from '../../platform/errors.js';
import type { Limiter } from '../../platform/rate-limit.js';
import type { MetricsRegistry } from '../../platform/metrics.js';
import { bearerToken } from '../auth/guard.js';

export interface MetricsRouteOptions {
  registry: MetricsRegistry;
  /** `METRICS_TOKEN`; the endpoint answers 404 while it is unset (api-contract 3). */
  token: string | undefined;
  /** Per-IP limit, applied before the token is compared so the token cannot be brute-forced. */
  limiter: Limiter;
}

/** Digest comparison in constant time, whatever the lengths of the two secrets. */
export function tokensMatch(presented: string, expected: string): boolean {
  const a = createHash('sha256').update(presented).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * GET /metrics, outside /api and outside the user guard: its own credential is the metrics token.
 * Prometheus text exposition format 0.0.4.
 */
export function metricsRoutes(app: FastifyInstance, options: MetricsRouteOptions): void {
  app.get('/metrics', async (request, reply) => {
    if (options.token === undefined) {
      throw new AppError('NOT_FOUND', 'The requested resource was not found.');
    }
    await options.limiter(request, reply);
    const presented = bearerToken(request.headers.authorization);
    if (presented === null || !tokensMatch(presented, options.token)) {
      reply.header('WWW-Authenticate', 'Bearer');
      throw new AppError('UNAUTHENTICATED', 'Authentication is required.');
    }
    return reply
      .header('Cache-Control', 'no-store')
      .type('text/plain; version=0.0.4; charset=utf-8')
      .send(options.registry.render());
  });
}

import type { Health } from '@midas/shared';
import type { FastifyInstance } from 'fastify';

export interface HealthRoutesOptions {
  version: string;
  checkDatabase: () => Promise<boolean>;
  startedAt: number;
  now: () => number;
}

/** GET /health: liveness plus database readiness (api-contract 3). 503 when the database is down. */
export function healthRoutes(app: FastifyInstance, options: HealthRoutesOptions): void {
  app.get('/health', async (request, reply) => {
    const databaseUp = await options.checkDatabase();
    if (!databaseUp) request.log.warn('health check: database unreachable');

    const body: Health = {
      status: databaseUp ? 'ok' : 'degraded',
      version: options.version,
      uptimeSeconds: Math.max(0, Math.floor((options.now() - options.startedAt) / 1000)),
      checks: { database: databaseUp ? 'up' : 'down' },
    };
    return reply
      .code(databaseUp ? 200 : 503)
      .header('Cache-Control', 'no-store')
      .send(body);
  });
}

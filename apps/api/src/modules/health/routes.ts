import type { Health } from '@midas/shared';
import type { FastifyInstance } from 'fastify';

export interface HealthRoutesOptions {
  version: string;
  checkDatabase: () => Promise<boolean>;
  startedAt: number;
  now: () => number;
}

/** How long a probe result is reused, so an unauthenticated flood cannot turn into DB load. */
export const HEALTH_CACHE_TTL_MS = 2000;

/**
 * Wraps a probe with a short TTL cache and single-flight: concurrent callers share one in-flight
 * probe, and a finished result (up or down) is reused until it is `ttlMs` old.
 */
export function cachedProbe(
  probe: () => Promise<boolean>,
  now: () => number,
  ttlMs: number = HEALTH_CACHE_TTL_MS,
): () => Promise<boolean> {
  let inFlight: Promise<boolean> | undefined;
  let cached: { value: boolean; at: number } | undefined;
  return () => {
    if (cached && now() - cached.at < ttlMs && now() >= cached.at) {
      return Promise.resolve(cached.value);
    }
    inFlight ??= probe()
      .then((value) => {
        cached = { value, at: now() };
        return value;
      })
      .finally(() => {
        inFlight = undefined;
      });
    return inFlight;
  };
}

/** GET /health: liveness plus database readiness (api-contract 3). 503 when the database is down. */
export function healthRoutes(app: FastifyInstance, options: HealthRoutesOptions): void {
  const check = cachedProbe(options.checkDatabase, options.now);
  app.get('/health', async (request, reply) => {
    const databaseUp = await check();
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

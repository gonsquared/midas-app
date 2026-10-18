import type { FastifyInstance } from 'fastify';
import type { PlatformMetricsService } from './metrics-service.js';

/** Registered inside the admin scope. Platform-wide aggregates only (ADR-018). */
export function adminMetricsRoutes(app: FastifyInstance, service: PlatformMetricsService): void {
  app.get('/api/v1/admin/metrics', async () => service.get());
}

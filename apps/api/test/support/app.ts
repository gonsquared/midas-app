import type { FastifyInstance } from 'fastify';
import { buildApp, type AppDeps } from '../../src/app.js';
import { loadConfig, type Config } from '../../src/platform/config.js';
import { createDatabaseClient } from '../../src/platform/db/client.js';

export const TEST_SECRET = 'test-only-secret-with-at-least-32-characters';

export function testEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: 'postgres://nobody:nopass@127.0.0.1:1/none',
    JWT_ACCESS_SECRET: TEST_SECRET,
    // Never pick up a local `pnpm build` (apps/web/dist is the default): with a build present the
    // SPA routes (`GET /`, `GET /assets/*`) would appear in the route-table audits and fail them.
    WEB_DIST_DIR: '/nonexistent/midas-web',
    ...overrides,
  };
}

export function testConfig(overrides: Record<string, string> = {}): Config {
  return loadConfig(testEnv(overrides));
}

/**
 * App with a lazily-connecting pool: unit tests never reach a real database because the
 * collaborators that would touch it are replaced through `deps`.
 */
export async function buildTestApp(
  deps: Partial<AppDeps> & { env?: Record<string, string> } = {},
): Promise<FastifyInstance> {
  const { env, ...rest } = deps;
  const config = rest.config ?? testConfig(env);
  const { db } = createDatabaseClient({
    url: config.database.url,
    poolMax: 1,
    statementTimeoutMs: 1000,
    ssl: 'off',
  });
  const app = await buildApp({ config, db, ...rest });
  app.addHook('onClose', async () => {
    await db.destroy();
  });
  return app;
}

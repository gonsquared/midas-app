import { defineConfig } from 'vitest/config';

/**
 * Performance sanity run (`pnpm --filter @midas/api test:perf`). Kept out of the default config
 * so `pnpm test` stays fast: it seeds 100k transactions for one user and takes a few minutes.
 * Same database setup as the integration tests (Testcontainers, or TEST_DATABASE_URL).
 */
export default defineConfig({
  test: {
    include: ['test/perf/**/*.perf.ts'],
    globalSetup: ['./test/global-setup.ts'],
    environment: 'node',
    testTimeout: 600_000,
    hookTimeout: 600_000,
    fileParallelism: false,
  },
});

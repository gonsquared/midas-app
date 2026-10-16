import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    globalSetup: ['./test/global-setup.ts'],
    environment: 'node',
    testTimeout: 20_000,
    hookTimeout: 120_000,
    // Database tests share one migrated database, so files run one at a time.
    fileParallelism: false,
  },
});

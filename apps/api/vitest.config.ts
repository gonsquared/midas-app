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
    // `pnpm --filter @midas/api test:coverage` (CI runs it). Architecture section 11 targets:
    // 80% overall and 85% for auth, transactions, transfers, budgets and recurring. The floors below
    // sit a few points under what was measured on 2026-10-19 (overall 93.4% lines, 91.3% statements,
    // 85.0% branches, 95.0% functions) so a real drop fails without flaking on small edits.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/platform/db/database.generated.ts',
        // The process entry point: listens on a port and wires signals, run by the smoke test in CI.
        'src/server.ts',
      ],
      reporter: ['text-summary', 'json-summary', 'text'],
      thresholds: {
        lines: 90,
        statements: 88,
        branches: 80,
        functions: 92,
        'src/modules/auth/**': { lines: 95 },
        'src/modules/transactions/**': { lines: 95 },
        'src/modules/transfers/**': { lines: 95 },
        'src/modules/budgets/**': { lines: 90 },
        'src/modules/recurring/**': { lines: 88 },
      },
    },
  },
});

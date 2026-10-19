import { defineConfig } from 'vitest/config';

// `pnpm --filter @midas/shared test:coverage` (CI runs it). The architecture gate for this package
// is 95% lines (section 11); the other floors sit a few points under the measured values
// (2026-10-19: 96.6% lines, 95.7% statements, 90.7% branches, 90.1% functions) so a real drop fails.
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      reporter: ['text-summary', 'json-summary'],
      thresholds: { lines: 95, statements: 94, branches: 87, functions: 87 },
    },
  },
});

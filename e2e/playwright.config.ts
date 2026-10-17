import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests run the real SPA from the Vite dev server (which proxies /api to the API port).
 * The specs intercept /api/v1 with an in-memory fake (support/fake-api.ts), so they need no
 * database. Set E2E_BASE_URL to point them at an already running app instead of starting Vite.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env['E2E_BASE_URL']
    ? undefined
    : {
        command: 'pnpm --filter @midas/web exec vite',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env['CI'],
        timeout: 60_000,
      },
});

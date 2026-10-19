import { defineConfig, devices } from '@playwright/test';

/**
 * Two ways to run the browser tests (README, "Checks and tests"):
 *
 * 1. Default: the real SPA from the Vite dev server (it proxies /api to the API port). Most specs
 *    intercept /api/v1 with an in-memory fake (support/fake-api.ts), so they need no database.
 * 2. E2E_BASE_URL=<url>: test an already running app and start nothing. CI uses this against the
 *    production image, where the API serves the built SPA under its real Content-Security-Policy.
 *    Add E2E_SERVED_BUILD=1 there: every test then fails on any securitypolicyviolation
 *    (support/test.ts) and the CSP specs run. On Windows Playwright's webServer cannot find pnpm,
 *    so start Vite (or the API) yourself and set E2E_BASE_URL.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  // Flakiness policy (E10-F2-S2): no retries locally, so a flaky test is noticed; one retry in CI,
  // with a trace captured on that retry only. No fixed sleeps anywhere: tests wait on locators.
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Phone viewport: auth flows only; the wallets and ledger specs assert desktop layouts.
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /auth\.spec\.ts/ },
  ],
  webServer: process.env['E2E_BASE_URL']
    ? undefined
    : {
        command: 'pnpm --filter @midas/web exec vite',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env['CI'],
        timeout: 60_000,
      },
});

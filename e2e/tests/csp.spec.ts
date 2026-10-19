import { expect, SERVED_BUILD, test, watchCspViolations } from '../support/test';
import { installFakeApi, makeWallet } from '../support/fake-api';
import { installSprint3Api, makeBudget, newSprint3State } from '../support/fake-sprint3';

/**
 * Strict-CSP check against the production build served by the API, with the server's own
 * Content-Security-Policy header (nothing is injected or replaced here). Every spec runs under the
 * violation guard in support/test.ts when E2E_SERVED_BUILD=1; this file adds the header contract
 * and walks the UI that is most likely to need inline script or style: auth pages, charts and
 * meters, a dialog, a menu and a toast.
 *
 *   docker build -f infra/docker/Dockerfile -t midas:local .
 *   (run it with a database, see docs/operations/deployment.md), then
 *   E2E_SERVED_BUILD=1 E2E_BASE_URL=http://localhost:3000 pnpm test:e2e
 *
 * The Zod `new Function` probe is not allowed for: Zod runs jitless (@midas/shared/zod-config),
 * so no violation of any kind may be reported.
 */
test.skip(
  !SERVED_BUILD,
  'Needs the API-served production build: set E2E_SERVED_BUILD=1 (see above).',
);

test.describe('headers sent by the server', () => {
  test('the SPA is served with the strict CSP and security headers', async ({ request }) => {
    for (const path of ['/', '/dashboard', '/login?redirect=%2Fwallets']) {
      const res = await request.get(path, { headers: { accept: 'text/html' } });
      expect(res.status(), path).toBe(200);
      expect(res.headers()['content-type'], path).toMatch(/^text\/html/);
      const csp = res.headers()['content-security-policy'] ?? '';
      expect(csp, path).toContain("default-src 'self'");
      expect(csp, path).toContain("script-src 'self'");
      expect(csp, path).toContain("style-src 'self'");
      expect(csp, path).toContain("frame-ancestors 'none'");
      expect(csp, path).toContain("object-src 'none'");
      expect(csp, path).not.toMatch(/unsafe-inline|unsafe-eval|\*/);
      expect(res.headers()['cache-control'], path).toBe('no-cache');
      expect(res.headers()['x-content-type-options'], path).toBe('nosniff');
      expect(res.headers()['x-frame-options'], path).toBe('DENY');
      expect(res.headers()['referrer-policy'], path).toBe('no-referrer');
    }
  });

  test('assets are immutable, and API paths never fall back to the SPA', async ({
    page,
    request,
  }) => {
    const assets = new Set<string>();
    page.on('response', (response) => {
      if (new URL(response.url()).pathname.startsWith('/assets/')) assets.add(response.url());
    });
    await installFakeApi(page);
    await page.goto('/login');
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    expect(assets.size).toBeGreaterThan(0);
    const first = [...assets][0] ?? '';
    const asset = await request.get(first);
    expect(asset.headers()['cache-control']).toBe('public, max-age=31536000, immutable');

    const unknown = await request.get('/api/v1/does-not-exist', {
      headers: { accept: 'text/html' },
    });
    expect(unknown.status()).toBe(404);
    expect(unknown.headers()['content-type']).toMatch(/^application\/problem\+json/);
    expect(unknown.headers()['cache-control']).toBe('no-store');
  });
});

test('auth pages raise no CSP violation', async ({ page }) => {
  await installFakeApi(page);
  for (const [path, heading] of [
    ['/login', 'Sign in'],
    ['/register', /Create your account|Create account|Register/],
    ['/forgot-password', /Forgot|Reset/],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  }
  await page.goto('/reset-password#token=not-a-real-token');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('dashboard, charts and budget meters raise no CSP violation', async ({ page }) => {
  const api = await installFakeApi(page, {
    signedIn: true,
    wallets: [makeWallet(10, 'Checking', 1008020)],
  });
  await installSprint3Api(
    page,
    api,
    newSprint3State({ budgets: [makeBudget(700, 0, 40000, 44520)] }),
  );

  await page.goto('/dashboard');
  await expect(page.locator('svg.recharts-surface')).toBeVisible();
  await expect(page.getByRole('meter', { name: 'Groceries budget' }).first()).toBeVisible();
  await page
    .getByTestId('trend-chart')
    .getByRole('group', { name: /Income and expenses by week/ })
    .focus();
  await page.keyboard.press('ArrowRight');
  await page.goto('/budgets');
  await expect(page.getByRole('meter', { name: 'Groceries budget' })).toBeVisible();
});

test('a dialog, a menu, a confirmation and a toast raise no CSP violation', async ({ page }) => {
  await installFakeApi(page, {
    signedIn: true,
    wallets: [makeWallet(10, 'Checking', 118000)],
  });
  await page.goto('/wallets');
  await expect(page.getByRole('table', { name: 'Wallets' })).toBeVisible();

  // Dialog with a form.
  await page.getByRole('link', { name: 'Create wallet' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Create wallet' });
  await dialog.getByLabel(/Name/).fill('Rainy day');
  await dialog.getByRole('radio', { name: /Savings/ }).check({ force: true });
  await dialog.getByLabel('Opening balance').fill('250');
  await dialog.getByRole('button', { name: 'Create wallet' }).click();
  await expect(page.getByRole('link', { name: 'Rainy day' })).toBeVisible();

  // Menu, confirmation dialog, then the toast it raises.
  await page.getByRole('button', { name: 'Actions for Checking' }).click();
  await page.getByRole('menuitem', { name: 'Archive wallet' }).click();
  await page
    .getByRole('alertdialog', { name: 'Archive Checking?' })
    .getByRole('button', { name: 'Archive wallet' })
    .click();
  await expect(page.getByText('Checking archived.').first()).toBeVisible();

  // Account menu in the app shell.
  await page.getByRole('button', { name: /Account menu/ }).click();
  await expect(page.getByRole('menuitem', { name: 'Sign out' })).toBeVisible();
});

test.describe('the violation watcher itself', () => {
  // Proves the policy is enforced and the watcher sees violations, so an empty list elsewhere
  // means something. The automatic guard is off here because this test breaks the policy on purpose.
  test.use({ cspGuardEnabled: false });

  test('an injected inline script is blocked and reported', async ({ page, context }) => {
    const violations = await watchCspViolations(context);
    await installFakeApi(page);
    await page.goto('/login');
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    await page.evaluate(() => {
      const script = document.createElement('script');
      script.textContent = 'window.__inlineRan = true';
      document.head.append(script);
    });
    // The console message and the securitypolicyviolation event arrive in either order, so wait
    // for the event's line itself instead of for the first entry (a flake seen in CI mode).
    await expect.poll(() => violations.join('\n')).toMatch(/script-src.*blocked=inline/);
    expect(
      await page.evaluate(() => (window as unknown as { __inlineRan?: boolean }).__inlineRan),
    ).toBeUndefined();
  });
});

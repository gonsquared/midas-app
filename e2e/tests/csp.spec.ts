import { expect, test } from '@playwright/test';
import { installFakeApi, makeWallet } from '../support/fake-api';
import { installSprint3Api, makeBudget, newSprint3State } from '../support/fake-sprint3';

/**
 * Strict-CSP check for the charts and meters. The Vite dev server injects inline scripts, so this
 * runs against a production build only:
 *   pnpm --filter @midas/web build && pnpm --filter @midas/web exec vite preview --port 4173
 *   E2E_CSP=1 E2E_BASE_URL=http://localhost:4173 pnpm test:e2e -- csp.spec.ts
 */
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'";

test.skip(!process.env['E2E_CSP'], 'Needs a production build behind E2E_BASE_URL (see above).');

test('dashboard, charts and budget meters raise no CSP violation', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      (window as unknown as { __csp: string[] }).__csp.push(
        `${event.violatedDirective} ${event.blockedURI} ${event.sourceFile}:${event.lineNumber}`,
      );
    });
  });
  const errors: string[] = [];
  page.on('console', (message) => {
    if (/Content Security Policy/i.test(message.text())) errors.push(message.text());
  });
  await page.route('**/*', async (route) => {
    const request = route.request();
    if (request.resourceType() !== 'document') return route.fallback();
    const response = await route.fetch();
    return route.fulfill({
      response,
      headers: { ...response.headers(), 'content-security-policy': CSP },
    });
  });
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

  const violations = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
  // Zod 4 probes `new Function` once to choose its JIT path and falls back when it is blocked.
  // That report exists for every page that parses a response (pre-existing, harmless), so it is
  // the one violation allowed here: nothing from Recharts, the meters or any style may appear.
  const unexpected = violations.filter(
    (v) => !v.startsWith('script-src eval ') || !v.includes('/assets/schemas-'),
  );
  expect(unexpected).toEqual([]);
  expect(errors).toEqual([]);
});

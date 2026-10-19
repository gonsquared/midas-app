import type { Page } from '@playwright/test';
import { expect, test } from '../support/test';
import { CATEGORIES, installFakeApi, makeWallet } from '../support/fake-api';
import {
  installSprint3Api,
  makeAdminUser,
  makeBudget,
  makeTemplate,
  newSprint3State,
} from '../support/fake-sprint3';

/**
 * Regenerates the README and user-guide screenshots in docs/images/. Not a test: it only runs
 * with CAPTURE_SCREENSHOTS=1 (`CAPTURE_SCREENSHOTS=1 pnpm --filter @midas/e2e exec playwright
 * test screenshots.spec.ts`). The pictures are the real SPA bundle rendered against the in-memory
 * fake API (support/fake-api.ts), so every name and amount in them is fixture data.
 */
test.skip(!process.env['CAPTURE_SCREENSHOTS'], 'screenshot capture is opt-in');
test.use({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });

function tx(
  n: number,
  type: 'expense' | 'income',
  cat: number,
  amountMinor: number,
  day: string,
  note: string,
) {
  const wallet = makeWallet(10, 'Checking');
  return {
    id: `00000000-0000-4000-8000-${String(500 + n).padStart(12, '0')}`,
    type,
    wallet: { id: wallet.id, name: wallet.name, currency: 'USD', archived: false },
    category: CATEGORIES[cat],
    amountMinor,
    currency: 'USD',
    occurredOn: day,
    note,
    transfer: null,
    recurringTemplateId: null,
    createdAt: `${day}T09:00:00.000Z`,
    updatedAt: `${day}T09:00:00.000Z`,
  };
}

async function arrange(page: Page, signedIn: boolean) {
  const api = await installFakeApi(page, {
    signedIn,
    transactions: [
      tx(5, 'expense', 0, 8420, '2026-10-18', 'Weekly shop'),
      tx(4, 'expense', 0, 3150, '2026-10-14', 'Farmers market'),
      tx(3, 'income', 1, 420000, '2026-10-01', 'October salary'),
      tx(2, 'expense', 0, 12950, '2026-10-09', 'Bulk order'),
      tx(1, 'expense', 0, 2240, '2026-10-05', 'Snacks'),
    ],
    wallets: [makeWallet(10, 'Checking', 1008020), makeWallet(11, 'Savings', 250000)],
  });
  await installSprint3Api(
    page,
    api,
    newSprint3State({
      role: 'admin',
      budgets: [makeBudget(700, 0, 40000, 44520), makeBudget(701, 1, 50000, 41000)],
      templates: [makeTemplate(900, 'Rent'), makeTemplate(901, 'Gym', 'paused')],
      users: [makeAdminUser(2, 'Lee Park'), makeAdminUser(1, 'Kim Morgan', 'admin')],
    }),
  );
}

async function shot(page: Page, path: string, name: string, theme: 'light' | 'dark' = 'light') {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await page.evaluate((v) => document.documentElement.setAttribute('data-theme', v), theme);
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.effect?.getComputedTiming().iterations === Infinity),
  );
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.screenshot({ path: `../docs/images/${name}.png`, fullPage: false });
}

test('capture screenshots', async ({ page }) => {
  await arrange(page, false);
  await shot(page, '/login', '01-sign-in');
  await page.unroute('**/*').catch(() => undefined);
  await arrange(page, true);
  await shot(page, '/dashboard', '02-dashboard');
  await shot(page, '/dashboard', '03-dashboard-dark', 'dark');
  await shot(page, '/wallets', '04-wallets');
  await shot(page, '/transactions', '05-transactions');
  await shot(page, '/budgets', '06-budgets');
  await shot(page, '/reports', '07-reports');
  await shot(page, '/recurring', '08-recurring');
  await shot(page, '/admin/users', '09-admin-users');
});

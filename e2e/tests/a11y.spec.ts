import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from '../support/test';
import { installFakeApi, makeWallet } from '../support/fake-api';
import {
  installSprint3Api,
  makeAdminUser,
  makeBudget,
  makeTemplate,
  newSprint3State,
} from '../support/fake-sprint3';

/**
 * E10-F2-S3 (WCAG 2.1 AA): axe-core on every main route, in the light and the dark theme, with
 * the mocked API (so every list has rows) and the same bundle that production serves.
 *
 * The theme follows the OS preference ("System"), so `colorScheme` drives it. Reduced motion
 * stops entry animations from sampling half-transparent colors, which would be false contrast
 * failures. Any axe violation fails the test; there is no allowlist.
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * Waits for every finite animation and transition to end. Colors fade for 140 ms when the theme
 * flips and dialogs fade in for 200 ms; axe samples the computed color at that instant, so a
 * scan taken mid-fade reports contrast failures that no user ever sees. Endless animations
 * (spinners, skeleton shimmer) are ignored.
 */
async function settleAnimations(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((animation) => animation.effect?.getComputedTiming().iterations === Infinity),
  );
}

interface RouteCase {
  name: string;
  path: string;
  /** Public pages are loaded signed out. */
  signedIn: boolean;
  /** Text of the page's h1, used as the "page is ready" signal. */
  heading: string | RegExp;
}

const ROUTES: RouteCase[] = [
  { name: 'sign in', path: '/login', signedIn: false, heading: /sign in/i },
  { name: 'register', path: '/register', signedIn: false, heading: /create/i },
  { name: 'forgot password', path: '/forgot-password', signedIn: false, heading: /reset|forgot/i },
  {
    name: 'reset password (with a token)',
    path: '/reset-password#token=abcdefghijklmnopqrstuvwxyz0123456789',
    signedIn: false,
    heading: /password/i,
  },
  { name: 'dashboard', path: '/dashboard', signedIn: true, heading: 'Dashboard' },
  { name: 'transactions', path: '/transactions', signedIn: true, heading: 'Transactions' },
  { name: 'wallets', path: '/wallets', signedIn: true, heading: 'Wallets' },
  { name: 'categories', path: '/categories', signedIn: true, heading: 'Categories' },
  { name: 'budgets', path: '/budgets', signedIn: true, heading: 'Budgets' },
  { name: 'recurring', path: '/recurring', signedIn: true, heading: 'Recurring' },
  { name: 'reports', path: '/reports', signedIn: true, heading: 'Reports' },
  { name: 'settings', path: '/settings', signedIn: true, heading: 'Settings' },
  { name: 'admin overview', path: '/admin', signedIn: true, heading: /admin/i },
  { name: 'admin users', path: '/admin/users', signedIn: true, heading: 'Users' },
  { name: 'admin categories', path: '/admin/categories', signedIn: true, heading: /categories/i },
  { name: 'admin audit log', path: '/admin/audit', signedIn: true, heading: /audit/i },
  { name: 'not found', path: '/no-such-page', signedIn: true, heading: /not found/i },
];

async function arrange(page: Page, signedIn: boolean) {
  const api = await installFakeApi(page, {
    signedIn,
    wallets: [makeWallet(10, 'Checking', 1008020), makeWallet(11, 'Savings', 250000)],
  });
  await installSprint3Api(
    page,
    api,
    newSprint3State({
      role: 'admin',
      budgets: [makeBudget(700, 0, 40000, 44520)],
      templates: [makeTemplate(900, 'Rent'), makeTemplate(901, 'Gym', 'paused')],
      users: [makeAdminUser(2, 'Lee Park'), makeAdminUser(1, 'Kim Morgan', 'admin')],
    }),
  );
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`axe, ${scheme} theme`, () => {
    test.use({ colorScheme: scheme, reducedMotion: 'reduce' });

    for (const route of ROUTES) {
      test(`${route.name} has no WCAG 2.1 A/AA violations`, async ({ page }) => {
        await arrange(page, route.signedIn);
        await page.goto(route.path);
        await expect(page.getByRole('heading', { level: 1 }).first()).toContainText(route.heading);
        // Signed-in pages take the theme from the account preference (the mocked user prefers
        // light), so set the attribute the theme provider sets; public pages follow the OS.
        await page.evaluate(
          (value) => document.documentElement.setAttribute('data-theme', value),
          scheme,
        );
        await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
        await settleAnimations(page);

        const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
        const summary = results.violations.map((v) => ({
          rule: v.id,
          impact: v.impact,
          help: v.help,
          nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
        }));
        expect(summary, `axe violations on ${route.path} (${scheme})`).toEqual([]);
      });
    }

    test('an open dialog and an open menu have no violations', async ({ page }) => {
      await arrange(page, true);
      await page.goto('/wallets');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.evaluate(
        (value) => document.documentElement.setAttribute('data-theme', value),
        scheme,
      );
      await page.getByRole('link', { name: 'Create wallet' }).first().click();
      await expect(page.getByRole('dialog', { name: 'Create wallet' })).toBeVisible();
      await settleAnimations(page);
      let results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      expect(
        results.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`),
        'dialog',
      ).toEqual([]);

      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toBeHidden();
      await page.getByRole('button', { name: /Account menu/ }).click();
      await expect(page.getByRole('menuitem', { name: 'Sign out' })).toBeVisible();
      await settleAnimations(page);
      results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      expect(
        results.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`),
        'menu',
      ).toEqual([]);
    });
  });
}

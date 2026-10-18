import { expect, test, type Page } from '@playwright/test';
import { installFakeApi, makeWallet } from '../support/fake-api';
import { installSprint3Api, makeBudget, newSprint3State } from '../support/fake-sprint3';

// QA gate E7-F2-S3 (responsive, theme aware) and E6-F1-S6 (state not by color alone).
async function openDashboard(page: Page) {
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
  await expect(page.getByTestId('hero-balance')).toBeVisible();
  await expect(page.locator('svg.recharts-surface').first()).toBeVisible();
}

test.describe('phone viewport', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the dashboard and its charts fit the screen without horizontal scrolling', async ({
    page,
  }) => {
    await openDashboard(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const chart = await page.getByTestId('trend-chart').boundingBox();
    expect(chart).not.toBeNull();
    expect(chart!.x + chart!.width).toBeLessThanOrEqual(390);
  });
});

test('chart series colors change with the dark theme', async ({ page }) => {
  await openDashboard(page);
  const read = () =>
    page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-series-income').trim(),
    );
  const light = await read();
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  const dark = await read();
  expect(light).not.toBe('');
  expect(dark).not.toBe('');
  expect(dark).not.toBe(light);
  await expect(page.locator('svg.recharts-surface').first()).toBeVisible();
});

test('an exceeded budget is announced in words, not only by color', async ({ page }) => {
  await openDashboard(page);
  await expect(page.getByRole('region', { name: 'Needs attention' })).toContainText(
    /over its monthly budget by \$45\.20/,
  );
  await expect(page.getByTestId('dashboard-budget').first()).toContainText('Over by $45.20');
});

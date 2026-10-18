import { expect, test } from '@playwright/test';
import { installFakeApi, makeWallet } from '../support/fake-api';
import { installSprint3Api, makeBudget, newSprint3State } from '../support/fake-sprint3';

test('shows balance, warnings and a trend chart with a table alternative; range stays in the URL', async ({
  page,
}) => {
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
  await expect(page.getByTestId('hero-balance')).toContainText('$10,080.20');
  await expect(page.getByRole('region', { name: 'Needs attention' })).toContainText(
    'Groceries is over its monthly budget by $45.20.',
  );

  const chart = page.getByTestId('trend-chart');
  await expect(chart.locator('svg.recharts-surface')).toBeVisible();
  await chart.getByRole('group', { name: /Income and expenses by week/ }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(chart.getByText(/Income \$4,200\.00\. Expenses \$3,100\.40\./)).toBeVisible();
  await chart.getByRole('radio', { name: 'Table' }).check({ force: true });
  await expect(chart.getByRole('table')).toContainText('$4,200.00');

  await page.getByLabel('Range', { exact: true }).selectOption('last-30');
  await expect(page).toHaveURL(/range=last-30/);
  await expect(page.getByTestId('hero-balance')).toBeVisible();
});

test('the chart library adds no style element', async ({ page }) => {
  const api = await installFakeApi(page, {
    signedIn: true,
    wallets: [makeWallet(10, 'Checking', 100)],
  });
  await installSprint3Api(page, api, newSprint3State());
  await page.goto('/dashboard');
  await expect(page.locator('svg.recharts-surface')).toBeVisible();
  const styles = await page.evaluate(
    () =>
      [...document.querySelectorAll('style')].filter((s) => /recharts/.test(s.textContent ?? ''))
        .length,
  );
  expect(styles).toBe(0);
});

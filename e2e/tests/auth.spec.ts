import { expect, test, type Page } from '@playwright/test';
import { installFakeApi } from '../support/fake-api';

const PASSWORD = 'correct horse battery staple';

async function signIn(page: Page) {
  await page.getByLabel('Email').fill('kim@example.com');
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test.describe('sign in, register and the route guard', () => {
  test('sends a signed-out visitor to sign in and returns them afterwards', async ({ page }) => {
    await installFakeApi(page);
    await page.goto('/wallets');
    await expect(page).toHaveURL(/\/login\?redirect=%2Fwallets/);
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    await signIn(page);
    await expect(page).toHaveURL(/\/wallets$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Wallets' })).toBeVisible();
  });

  test('refuses an open redirect and lands on the dashboard', async ({ page }) => {
    await installFakeApi(page);
    await page.goto('/login?redirect=//evil.example');
    await signIn(page);
    await expect(page).toHaveURL(/\/dashboard$/);
    expect(new URL(page.url()).hostname).not.toBe('evil.example');
  });

  test('keeps the access token out of web storage', async ({ page }) => {
    await installFakeApi(page);
    await page.goto('/login');
    await signIn(page);
    await expect(page).toHaveURL(/\/dashboard$/);
    const stored = await page.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    );
    expect(stored).not.toContain('e2e-access-token');
  });

  test('registers, lands on the dashboard, and signs out', async ({ page }) => {
    await installFakeApi(page);
    await page.goto('/register');
    await page.getByLabel('Name').fill('Kim Morgan');
    await page.getByLabel('Email').fill('kim@example.com');
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.getByRole('button', { name: /Account menu/ }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login\?reason=signed-out/);
    await expect(page.getByText('You have signed out.')).toBeVisible();
  });

  test('validates on the client without calling the API', async ({ page }) => {
    const api = await installFakeApi(page);
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Enter your email address.')).toBeVisible();
    expect(api.requests.filter((r) => r.includes('/auth/login'))).toHaveLength(0);
  });
});

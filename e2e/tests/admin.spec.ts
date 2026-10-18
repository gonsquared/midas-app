import { expect, test } from '@playwright/test';
import { installFakeApi } from '../support/fake-api';
import { installSprint3Api, makeAdminUser, newSprint3State } from '../support/fake-sprint3';

test('an admin suspends a user after confirming, and sees no financial data', async ({ page }) => {
  const api = await installFakeApi(page, { signedIn: true });
  const state = newSprint3State({
    role: 'admin',
    users: [makeAdminUser(2, 'Lee Park'), makeAdminUser(1, 'Kim Morgan', 'admin')],
  });
  await installSprint3Api(page, api, state);

  await page.goto('/admin');
  await expect(page.getByTestId('admin-privacy')).toContainText('never show anyone');
  await page.goto('/admin/users');
  const table = page.getByRole('table', { name: 'Users' });
  await expect(table).toContainText('Lee Park');
  await expect(table).not.toContainText('Transactions');

  await page.getByRole('button', { name: /Manage Lee Park/ }).click();
  const drawer = page.getByRole('dialog', { name: 'Lee Park' });
  await drawer.getByRole('button', { name: 'Suspend' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Suspend Lee Park?' });
  await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
  expect(state.suspendedIds).toHaveLength(0);
  await confirm.getByLabel(/Reason/).fill('Abuse');
  await confirm.getByRole('button', { name: 'Suspend account' }).click();
  await expect(confirm).toBeHidden();
  expect(state.suspendedIds).toHaveLength(1);
});

test('a regular user gets Not found for admin pages', async ({ page }) => {
  const api = await installFakeApi(page, { signedIn: true });
  await installSprint3Api(page, api, newSprint3State());
  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { name: /not found/i })).toBeVisible();
});

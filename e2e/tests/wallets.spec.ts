import { expect, test } from '../support/test';
import { installFakeApi, makeWallet } from '../support/fake-api';

test('creates a wallet and archives another only after confirming', async ({ page }) => {
  const api = await installFakeApi(page, {
    signedIn: true,
    wallets: [makeWallet(10, 'Checking', 118000)],
  });
  await page.goto('/wallets');
  await expect(page.getByRole('table', { name: 'Wallets' })).toBeVisible();

  await page.getByRole('link', { name: 'Create wallet' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Create wallet' });
  await dialog.getByLabel(/Name/).fill('Rainy day');
  await dialog.getByRole('radio', { name: /Savings/ }).check({ force: true });
  await dialog.getByLabel('Opening balance').fill('250');
  await dialog.getByRole('button', { name: 'Create wallet' }).click();
  await expect(page.getByRole('link', { name: 'Rainy day' })).toBeVisible();

  await page.getByRole('button', { name: 'Actions for Checking' }).click();
  await page.getByRole('menuitem', { name: 'Archive wallet' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Archive Checking?' });
  await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
  expect(api.wallets.find((w) => w.name === 'Checking')?.archived).toBe(false);
  await confirm.getByRole('button', { name: 'Archive wallet' }).click();
  await expect(page.getByRole('link', { name: 'Checking' })).toHaveCount(0);
  expect(api.wallets.find((w) => w.name === 'Checking')?.archived).toBe(true);
});

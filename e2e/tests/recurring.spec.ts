import { expect, test } from '../support/test';
import { installFakeApi, makeWallet } from '../support/fake-api';
import { installSprint3Api, makeTemplate, newSprint3State } from '../support/fake-sprint3';

test('creates a recurring transaction with a live preview, then pauses another', async ({
  page,
}) => {
  const api = await installFakeApi(page, {
    signedIn: true,
    wallets: [makeWallet(10, 'Checking', 100000)],
  });
  const state = newSprint3State({ templates: [makeTemplate(701, 'Rent')] });
  await installSprint3Api(page, api, state);

  await page.goto('/recurring');
  await expect(page.getByRole('table', { name: 'Recurring transactions' })).toContainText('Rent');

  await page.getByRole('button', { name: 'Create recurring' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Create recurring transaction' });
  await dialog.getByRole('button', { name: 'Create recurring' }).click();
  await expect(dialog.getByText('Enter a name.').first()).toBeVisible();

  await dialog.getByLabel(/^Name/).fill('Phone');
  await dialog.getByLabel(/^Amount/).fill('40');
  await dialog.getByLabel(/^Wallet/).selectOption({ label: 'Checking (USD)' });
  await dialog.getByLabel(/^Category/).selectOption({ label: 'Groceries' });
  await expect(dialog.getByRole('heading', { name: 'Next dates' })).toBeVisible();
  await expect(dialog.getByRole('listitem').first()).toBeVisible();
  await dialog.getByRole('button', { name: 'Create recurring' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('table', { name: 'Recurring transactions' })).toContainText('Phone');

  await page.getByRole('button', { name: /^Pause Rent/ }).click();
  await expect(page.getByRole('row', { name: /Rent/ })).toContainText('Paused');
  expect(state.templates.find((t) => t['name'] === 'Rent')?.['status']).toBe('paused');
});

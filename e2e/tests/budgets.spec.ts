import { expect, test } from '@playwright/test';
import { installFakeApi, makeWallet } from '../support/fake-api';
import { installSprint3Api, makeBudget, newSprint3State } from '../support/fake-sprint3';

test('creates a budget and shows overspend warnings with text, not just color', async ({
  page,
}) => {
  const api = await installFakeApi(page, {
    signedIn: true,
    wallets: [makeWallet(10, 'Checking', 100000)],
  });
  const state = newSprint3State({ budgets: [makeBudget(700, 0, 40000, 44520)] });
  await installSprint3Api(page, api, state);

  await page.goto('/budgets');
  const attention = page.getByRole('region', { name: 'Needs attention (1)' });
  await expect(attention).toContainText('Over by $45.20');
  await expect(attention.getByRole('meter', { name: 'Groceries budget' })).toBeVisible();

  await page.getByRole('button', { name: 'Create budget' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Create budget' });
  await dialog.getByLabel('Limit').fill('2000');
  await dialog.getByRole('button', { name: 'Create budget' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('region', { name: 'On track (1)' })).toContainText('Overall');
  expect(state.budgets).toHaveLength(2);

  await page.getByRole('button', { name: 'Actions for Overall budget' }).click();
  await page.getByRole('menuitem', { name: 'Delete budget' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Delete Overall budget?' });
  await expect(confirm).toContainText("Your transactions aren't affected.");
  await confirm.getByRole('button', { name: 'Delete budget' }).click();
  await expect(page.getByRole('region', { name: /On track/ })).toHaveCount(0);
  expect(state.budgets).toHaveLength(1);

  await page.getByRole('button', { name: 'Previous period' }).click();
  await expect(page).toHaveURL(/[?&]date=/);
});

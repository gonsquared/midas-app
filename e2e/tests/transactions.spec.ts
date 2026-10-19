import { expect, test } from '../support/test';
import { installFakeApi, makeWallet } from '../support/fake-api';

test('adds transactions from the composer and filters the ledger with URL state', async ({
  page,
}) => {
  await installFakeApi(page, { signedIn: true, wallets: [makeWallet(10, 'Checking', 100000)] });
  await page.goto('/transactions?compose=expense');
  const drawer = page.getByRole('dialog', { name: 'Add transaction' });
  await expect(drawer.getByLabel(/Amount/)).toBeFocused();
  await drawer.getByLabel(/Amount/).fill('54.20');
  await drawer.getByRole('combobox', { name: /Category/ }).click();
  await page.getByRole('option', { name: /Groceries/ }).click();
  await drawer.getByLabel(/Note/).fill('Weekly shop');
  await drawer.getByRole('button', { name: 'Add expense' }).click();
  await expect(drawer).toBeHidden();
  await expect(page.getByRole('link', { name: /Weekly shop/ })).toBeVisible();

  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Income' }).click();
  const income = page.getByRole('dialog', { name: 'Add transaction' });
  await income.getByLabel(/Amount/).fill('4200');
  await income.getByRole('combobox', { name: /Category/ }).click();
  await page.getByRole('option', { name: /Salary/ }).click();
  await income.getByLabel(/Note/).fill('October pay');
  await income.getByRole('button', { name: 'Add income' }).click();
  await expect(page.getByRole('link', { name: /October pay/ })).toBeVisible();

  await page.getByRole('button', { name: 'Type' }).click();
  await page
    .getByRole('dialog', { name: 'Type' })
    .getByRole('checkbox', { name: 'Income' })
    .check();
  await expect(page).toHaveURL(/[?&]type=income/);
  await expect(page.getByRole('link', { name: /October pay/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Weekly shop/ })).toHaveCount(0);

  await page.getByLabel('Search notes').fill('october');
  await expect(page).toHaveURL(/[?&]q=october/);
});

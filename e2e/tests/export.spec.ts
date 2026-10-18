import { expect, test } from '@playwright/test';
import { installFakeApi, makeWallet } from '../support/fake-api';
import { installSprint3Api, newSprint3State } from '../support/fake-sprint3';

test('exports the filtered ledger as a CSV download', async ({ page }) => {
  const api = await installFakeApi(page, {
    signedIn: true,
    wallets: [makeWallet(10, 'Checking', 100000)],
  });
  const state = newSprint3State();
  await installSprint3Api(page, api, state);

  await page.goto('/transactions?type=expense&q=shop');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('midas-transactions-20261016.csv');
  expect(state.exportRequests).toHaveLength(1);
  expect(state.exportRequests[0]).toContain('type=expense');
  expect(state.exportRequests[0]).toContain('q=shop');
  expect(state.exportRequests[0]).not.toContain('limit=');
});

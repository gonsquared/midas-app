import type { Page } from '@playwright/test';
import { expect, test } from '../support/test';
import { installFakeApi, makeWallet } from '../support/fake-api';
import { installSprint3Api, makeBudget, newSprint3State } from '../support/fake-sprint3';

/**
 * E10-F2-S3: the keyboard half of the manual checklist, performed with real key presses in
 * Chromium (docs/qa/accessibility-audit.md). Screen readers are NOT covered here.
 */
async function signedInShell(page: Page) {
  await installFakeApi(page, {
    signedIn: true,
    wallets: [makeWallet(10, 'Checking', 118000)],
  });
}

/** A readable description of the focused element: its accessible-ish name and tag. */
function focusedLabel(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return 'body';
    const labelled = el.getAttribute('aria-label');
    const id = el.id ? document.querySelector(`label[for="${el.id}"]`)?.textContent : null;
    return `${el.tagName.toLowerCase()}:${(labelled ?? id ?? el.textContent ?? '').trim().slice(0, 40)}`;
  });
}

test('the skip link is the first tab stop and moves focus to the main region', async ({ page }) => {
  await signedInShell(page);
  await page.goto('/wallets');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to main content' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
});

test('every tab stop on the sign-in page shows a visible focus indicator, in DOM order', async ({
  page,
}) => {
  await installFakeApi(page, { signedIn: false });
  await page.goto('/login');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  const order: string[] = [];
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press('Tab');
    const label = await focusedLabel(page);
    // Past the last control focus leaves the document (to the browser UI): the loop is complete.
    if (label === 'body') break;
    order.push(label);
    const visible = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const style = getComputedStyle(el);
      return (
        (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) ||
        style.boxShadow !== 'none'
      );
    });
    expect(visible, `focus indicator on ${order.at(-1)}`).toBe(true);
  }
  const email = order.findIndex((l) => /email/i.test(l));
  const password = order.findIndex((l) => /password/i.test(l) && !/forgot/i.test(l));
  const submit = order.findIndex((l) => /^button:sign in/i.test(l));
  expect(email, order.join(' | ')).toBeGreaterThanOrEqual(0);
  expect(password).toBeGreaterThan(email);
  expect(submit).toBeGreaterThan(password);
});

test('a dialog traps Tab, makes the page behind it inert, closes on Escape and returns focus', async ({
  page,
}) => {
  await signedInShell(page);
  await page.goto('/wallets');
  const trigger = page.getByRole('link', { name: 'Create wallet' }).first();
  await trigger.focus();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Create wallet' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  // Focus moved into the dialog.
  expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);

  // Forward and backward tabbing never leaves the dialog.
  for (let i = 0; i < 14; i += 1) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((el) => el.contains(document.activeElement)), `tab ${i}`).toBe(
      true,
    );
  }
  for (let i = 0; i < 14; i += 1) {
    await page.keyboard.press('Shift+Tab');
    expect(await dialog.evaluate((el) => el.contains(document.activeElement)), `shift ${i}`).toBe(
      true,
    );
  }

  // The page behind is not reachable by assistive technology while the dialog is open.
  const behind = await page.evaluate(() => {
    const main = document.querySelector('main');
    return main ? main.closest('[inert],[aria-hidden="true"]') !== null : null;
  });
  expect(behind, 'main landmark is inert or aria-hidden behind the dialog').toBe(true);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('main')).toBeVisible();
  await expect(trigger).toBeFocused();
});

test('a budget confirmation starts on Cancel, Escape dismisses it and focus returns to the row menu button', async ({
  page,
}) => {
  const api = await installFakeApi(page, {
    signedIn: true,
    wallets: [makeWallet(10, 'Checking', 100000)],
  });
  await installSprint3Api(
    page,
    api,
    newSprint3State({ budgets: [makeBudget(700, 0, 40000, 4000)] }),
  );
  await page.goto('/budgets');
  const actions = page.getByRole('button', { name: 'Actions for Groceries budget' });
  await actions.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('menuitem', { name: 'Delete budget' }).focus();
  await page.keyboard.press('Enter');

  const confirm = page.getByRole('alertdialog', { name: 'Delete Groceries budget?' });
  await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(confirm).toBeHidden();
  await expect(actions).toBeFocused();
});

// Tracked defect A11Y-02 (docs/qa/accessibility-audit.md): the wallet archive confirmation, opened
// from a row menu, does not return focus to the row's Actions button (focus falls to <body>), unlike
// budgets, recurring and admin pages that use useReturnFocus. test.fail() turns green again, and
// this test starts failing, the day the page is fixed: then delete the test.fail line.
test('a wallet confirmation opened from the row menu returns focus to the menu button', async ({
  page,
}) => {
  test.fail(true, 'A11Y-02: wallet row-menu confirmations lose focus on close');
  await signedInShell(page);
  await page.goto('/wallets');
  const actions = page.getByRole('button', { name: 'Actions for Checking' });
  await actions.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('menuitem', { name: 'Archive wallet' }).focus();
  await page.keyboard.press('Enter');

  const confirm = page.getByRole('alertdialog', { name: 'Archive Checking?' });
  await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(confirm).toBeHidden();
  await expect(actions).toBeFocused();
});

test('the account menu opens and closes from the keyboard and returns focus', async ({ page }) => {
  await signedInShell(page);
  await page.goto('/wallets');
  const button = page.getByRole('button', { name: /Account menu/ });
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem', { name: 'Sign out' })).toBeVisible();
  await page.keyboard.press('ArrowDown');
  expect(await page.evaluate(() => document.activeElement?.getAttribute('role'))).toMatch(
    /menuitem/,
  );
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menuitem', { name: 'Sign out' })).toBeHidden();
  await expect(button).toBeFocused();
});

test('client-side navigation moves focus to the new page heading and announces it', async ({
  page,
}) => {
  await signedInShell(page);
  await page.goto('/wallets');
  await expect(page.getByRole('heading', { level: 1, name: 'Wallets' })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Primary' })
    .first()
    .getByRole('link', { name: 'Budgets' })
    .click();
  await expect(page).toHaveURL(/\/budgets/);
  await expect(page.getByRole('heading', { level: 1, name: 'Budgets' })).toBeFocused();
});

import { expect, test } from '@playwright/test';

/**
 * Real-API smoke path: no request interception. Needs the SPA (Vite proxies /api to the API) and
 * an API on PostgreSQL 17 with migrations and `seed:system` applied. Opt in with E2E_REAL_API=1:
 *
 *   E2E_REAL_API=1 E2E_BASE_URL=http://localhost:5173 pnpm test:e2e -- real-api
 *
 * The API must run with APP_BASE_URL equal to E2E_BASE_URL (the refresh endpoint checks Origin)
 * and the default rate limits or higher.
 */
test.skip(!process.env['E2E_REAL_API'], 'set E2E_REAL_API=1 with a running API and database');

const PASSWORD = 'correct horse battery staple 42';

test('register, reload (silent refresh), sign out, sign in, create a wallet, add a transaction', async ({
  page,
}) => {
  const email = `smoke-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

  await page.goto('/register');
  await page.getByLabel('Name').fill('Smoke Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // The access token lives in memory only: a reload must be restored through the httpOnly cookie.
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard$/);
  const stored = await page.evaluate(
    () => JSON.stringify({ ...window.localStorage, ...window.sessionStorage }) + document.cookie,
  );
  expect(stored).not.toMatch(/eyJ/);
  expect(await page.evaluate(() => document.cookie)).not.toContain('midas_rt');

  await page.getByRole('button', { name: /Account menu/ }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login\?reason=signed-out/);

  // After logout the session is revoked server side: a protected page bounces to sign-in.
  await page.goto('/wallets');
  await expect(page).toHaveURL(/\/login\?redirect=%2Fwallets/);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/wallets$/);

  await page.getByRole('link', { name: 'Create wallet' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Create wallet' });
  await dialog.getByLabel(/Name/).fill('Smoke Checking');
  await dialog.getByRole('radio', { name: /Bank/ }).check({ force: true });
  await dialog.getByLabel('Opening balance').fill('1000');
  await dialog.getByRole('button', { name: 'Create wallet' }).click();
  await expect(page.getByRole('link', { name: 'Smoke Checking' })).toBeVisible();
  await expect(page.getByText('$1,000.00').first()).toBeVisible();

  await page.goto('/transactions?compose=expense');
  const drawer = page.getByRole('dialog', { name: 'Add transaction' });
  await drawer.getByLabel(/Amount/).fill('54.20');
  await drawer.getByRole('combobox', { name: /Category/ }).click();
  await page.getByRole('option', { name: /Groceries/ }).click();
  await drawer.getByLabel(/Note/).fill('Smoke groceries');
  await drawer.getByRole('button', { name: 'Add expense' }).click();
  await expect(drawer).toBeHidden();
  await expect(page.getByRole('link', { name: /Smoke groceries/ })).toBeVisible();

  // The server computed the new balance: 1000.00 - 54.20.
  await page.goto('/wallets');
  await expect(page.getByText('$945.80').first()).toBeVisible();

  // Same-origin API without credentials stays closed.
  const anonymous = await page.request.get('/api/v1/wallets', {
    headers: { authorization: '' },
  });
  expect(anonymous.status()).toBe(401);
});

test('forgot and reset password work end to end, and the old password stops working', async ({
  page,
}) => {
  const mailLog = process.env['E2E_MAIL_LOG'];
  test.skip(
    !mailLog,
    'set E2E_MAIL_LOG to the API log file (MAIL_TRANSPORT=console, LOG_LEVEL=info)',
  );
  const { readFileSync } = await import('node:fs');
  const email = `reset-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const newPassword = 'a completely different passphrase 77';

  await page.goto('/register');
  await page.getByLabel('Name').fill('Reset Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole('button', { name: /Account menu/ }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();

  await page.goto('/forgot-password');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText(/If an account exists/i)).toBeVisible();

  const readToken = () => {
    const lines = readFileSync(mailLog!, 'utf8')
      .split('\n')
      .filter((l) => l.includes(email));
    const match = /reset-password#token=([\w-]+)/.exec(lines.at(-1) ?? '');
    return match?.[1];
  };
  await expect.poll(readToken, { timeout: 10_000 }).toBeTruthy();
  const token = readToken();

  await page.goto(`/reset-password#token=${token}`);
  await page.getByLabel('New password', { exact: true }).fill(newPassword);
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page).toHaveURL(/\/login/);

  // The link is single use.
  await page.goto(`/reset-password#token=${token}`);
  await expect(page.getByText('This link has expired or was already used.')).toBeVisible();

  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByLabel('Password', { exact: true }).fill(newPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('replaying an old-generation refresh token revokes the whole session (reuse detection)', async ({
  page,
}) => {
  const email = `reuse-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const refreshCookie = async () =>
    (await page.context().cookies()).find((c) => c.name === 'midas_rt');

  await page.goto('/register');
  await page.getByLabel('Name').fill('Reuse Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // Cookie format is `<sessionId>.<random>`; each silent refresh (reload) rotates the random part.
  const first = await refreshCookie();
  expect(first?.value).toMatch(/^[\w-]+\.[\w-]+$/);
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard$/);
  const second = await refreshCookie();
  expect(second?.value).not.toBe(first?.value);
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard$/);
  const third = await refreshCookie();
  expect(third?.value).not.toBe(second?.value);

  // Replay the token from two rotations ago, as a thief would. Sent by hand with a clean context.
  const origin = new URL(page.url()).origin;
  const replay = await page.context().browser()!.newContext();
  try {
    const res = await replay.request.post(`${origin}/api/v1/auth/refresh`, {
      headers: {
        origin,
        'x-csrf-protection': '1',
        cookie: `midas_rt=${first!.value}`,
      },
    });
    expect(res.status()).toBe(401);
  } finally {
    await replay.close();
  }

  // The legitimate holder is cut off too: the session was revoked, so a reload bounces to sign-in.
  await page.reload();
  await expect(page).toHaveURL(/\/login/);
});

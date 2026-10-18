import type { Category, Transaction, Wallet } from '@midas/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeCategory, makeTransaction, makeWallet, resetFixtureIds, uuid } from '@/test/fixtures';
import { mockApi, noContent, ok, problem } from '@/test/mock-api';
import { renderApp, setViewport, signedInAs, VIEWPORT } from '@/test/helpers';
import { resetComposerSession } from './composer-store';

let wallets: Wallet[];
let categories: Category[];
let transactions: Transaction[];
const CHECKING = uuid(801);
const SAVINGS = uuid(802);
const EURO = uuid(803);
const GROCERIES = uuid(811);

beforeEach(() => {
  resetFixtureIds();
  resetComposerSession();
  wallets = [
    makeWallet({ id: CHECKING, name: 'Checking', balanceMinor: 120000 }),
    makeWallet({ id: SAVINGS, name: 'Savings', type: 'savings', balanceMinor: 500000 }),
    makeWallet({ id: EURO, name: 'Euro', currency: 'EUR', balanceMinor: 10000 }),
  ];
  categories = [
    makeCategory({ id: GROCERIES, name: 'Groceries' }),
    makeCategory({ id: uuid(812), name: 'Salary', type: 'income', icon: 'briefcase' }),
  ];
  transactions = [];
});

function api(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /wallets': () => ok({ items: wallets }),
    'GET /categories': () => ok({ items: categories }),
    'GET /transactions': () => ok({ items: transactions, nextCursor: null }),
    ...extra,
  });
}

async function open(path: string, viewport: number = VIEWPORT.tablet) {
  setViewport(viewport);
  signedInAs('user');
  const user = userEvent.setup();
  const utils = await renderApp(path);
  return { user, ...utils };
}

async function drawer() {
  return screen.findByRole('dialog', { name: /Add transaction|Move money/ });
}

async function pickGroceries(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
  await user.click(within(dialog).getByRole('combobox', { name: /Category/ }));
  await user.click(await screen.findByRole('option', { name: /Groceries/ }));
}

describe('transaction form', () => {
  it('opens from ?compose= on any page with focus on Amount, and validates inline', async () => {
    const mock = api();
    const { user } = await open('/dashboard?compose=expense');
    const dialog = await drawer();
    await waitFor(() => expect(within(dialog).getByLabelText(/Amount/)).toHaveFocus());
    await user.click(within(dialog).getByRole('button', { name: 'Add expense' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('2 things need fixing');
    expect(within(dialog).getByText('Enter an amount greater than 0.')).toBeVisible();
    expect(within(dialog).getByText('Choose a category.')).toBeVisible();
    expect(mock.callsTo('POST /transactions')).toHaveLength(0);
  });

  it('adds an expense in minor units, closes, and confirms with the new balance', async () => {
    const mock = api({
      'POST /transactions': (request) => {
        const body = request.body as Record<string, unknown>;
        wallets = wallets.map((w) => (w.id === CHECKING ? { ...w, balanceMinor: 114580 } : w));
        return ok(
          makeTransaction({
            wallet: wallets[0]!,
            category: categories[0]!,
            amountMinor: body['amountMinor'] as number,
          }),
          201,
        );
      },
    });
    const { user, router } = await open('/dashboard?compose=expense');
    const dialog = await drawer();
    await user.type(within(dialog).getByLabelText(/Amount/), '54.20');
    await pickGroceries(user, dialog);
    await user.type(within(dialog).getByLabelText(/Note/), 'Weekly shop');
    await user.click(within(dialog).getByRole('button', { name: 'Add expense' }));
    await waitFor(() => expect(mock.callsTo('POST /transactions')).toHaveLength(1));
    expect(mock.callsTo('POST /transactions')[0]?.body).toMatchObject({
      type: 'expense',
      walletId: CHECKING,
      categoryId: GROCERIES,
      amountMinor: 5420,
      note: 'Weekly shop',
    });
    expect(await screen.findByText(/Expense added\. Checking is now \$1,145\.80\./)).toBeVisible();
    await waitFor(() => expect(router.state.location.search).toEqual({}));
    expect(router.state.location.pathname).toBe('/dashboard');
  });

  it('maps server errors onto fields and keeps the input', async () => {
    api({ 'POST /transactions': problem(409, 'WALLET_ARCHIVED') });
    const { user } = await open('/dashboard?compose=expense');
    const dialog = await drawer();
    await user.type(within(dialog).getByLabelText(/Amount/), '10');
    await pickGroceries(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Add expense' }));
    expect(
      await within(dialog).findByText('This wallet is archived. Choose another wallet.'),
    ).toBeVisible();
    expect(within(dialog).getByLabelText(/Amount/)).toHaveValue('10');
  });

  it('says the outcome is unknown after a network failure', async () => {
    const mock = api();
    mock.fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if ((init?.method ?? 'GET') === 'POST') throw new TypeError('offline');
      const body = url.includes('/wallets')
        ? { items: wallets }
        : url.includes('/categories')
          ? { items: categories }
          : { items: [], nextCursor: null };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    const { user } = await open('/dashboard?compose=expense');
    const dialog = await drawer();
    await user.type(within(dialog).getByLabelText(/Amount/), '10');
    await pickGroceries(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Add expense' }));
    expect(await within(dialog).findByText(/couldn't confirm this was saved/)).toBeVisible();
  });

  it('switches type keeping the amount and clearing the category', async () => {
    api();
    const { user } = await open('/dashboard?compose=expense');
    const dialog = await drawer();
    await user.type(within(dialog).getByLabelText(/Amount/), '12');
    await pickGroceries(user, dialog);
    await user.click(within(dialog).getByRole('radio', { name: 'Income' }));
    expect(within(dialog).getByLabelText(/Amount/)).toHaveValue('12');
    expect(within(dialog).getByRole('combobox', { name: /Category/ })).toHaveValue('');
    expect(await screen.findByRole('button', { name: 'Add income' })).toBeVisible();
  });

  it('offers all three modes in one segmented control and switches between them', async () => {
    api();
    const { user, router } = await open('/dashboard?compose=expense');
    const dialog = await drawer();
    for (const name of ['Expense', 'Income', 'Transfer']) {
      expect(within(dialog).getByRole('radio', { name })).toBeVisible();
    }
    await user.click(within(dialog).getByRole('radio', { name: 'Transfer' }));
    expect(await within(dialog).findByRole('button', { name: 'Move money' })).toBeVisible();
    expect(within(dialog).getByRole('combobox', { name: /From wallet/ })).toHaveValue('Checking');
    expect(router.state.location.search).toMatchObject({ compose: 'transfer' });
    await user.click(within(dialog).getByRole('radio', { name: 'Expense' }));
    expect(await within(dialog).findByRole('button', { name: 'Add expense' })).toBeVisible();
    await user.click(within(dialog).getByRole('radio', { name: 'Income' }));
    expect(await within(dialog).findByRole('button', { name: 'Add income' })).toBeVisible();
  });

  it('asks before discarding a dirty form', async () => {
    api();
    const { user } = await open('/dashboard?compose=expense');
    const dialog = await drawer();
    await user.type(within(dialog).getByLabelText(/Amount/), '5');
    await user.keyboard('{Escape}');
    const confirm = await screen.findByRole('alertdialog', { name: 'Discard this transaction?' });
    expect(within(confirm).getByRole('button', { name: 'Keep editing' })).toHaveFocus();
  });
});

describe('overlay history', () => {
  async function addExpenseFromMenu(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: 'Add' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Expense' }));
  }

  it('Create wallet from the empty composer replaces the overlay entry instead of popping it', async () => {
    wallets = [];
    api();
    const { user, router } = await open('/wallets');
    await router.navigate({ to: '/dashboard' });
    await addExpenseFromMenu(user);
    const dialog = await drawer();
    await user.click(await within(dialog).findByRole('link', { name: 'Create wallet' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/wallets/new'));
    expect(router.state.location.search).not.toHaveProperty('compose');
    // The overlay entry was replaced, so Back lands on the page it was opened from.
    router.history.back();
    await waitFor(() => expect(router.state.location.pathname).toBe('/dashboard'));
    expect(router.state.location.search).not.toHaveProperty('compose');
  });

  it('closing a pasted-link overlay after an earlier browser Back does not leave the page', async () => {
    api();
    const { user, router } = await open('/wallets');
    await router.navigate({ to: '/dashboard' });
    await addExpenseFromMenu(user);
    await drawer();
    router.history.back();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // The same overlay now arrives without an app-pushed entry (a link opened directly).
    await router.navigate({
      to: '/dashboard',
      search: { compose: 'expense' } as never,
      replace: true,
    });
    const dialog = await drawer();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe('/dashboard');
    expect(router.state.location.search).not.toHaveProperty('compose');
  });

  it('pops the entry it pushed when the overlay was opened from the app', async () => {
    api();
    const { user, router } = await open('/wallets');
    await router.navigate({ to: '/dashboard' });
    await addExpenseFromMenu(user);
    const dialog = await drawer();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe('/dashboard');
    expect(router.state.location.search).not.toHaveProperty('compose');
  });
});

describe('transfer form', () => {
  it('selects source and destination, previews balances and moves money', async () => {
    const mock = api({
      'POST /transfers': ok(
        {
          id: uuid(),
          fromWallet: { id: CHECKING, name: 'Checking', currency: 'USD', archived: false },
          toWallet: { id: SAVINGS, name: 'Savings', currency: 'USD', archived: false },
          amountMinor: 20000,
          toAmountMinor: 20000,
          occurredOn: '2026-10-16',
          note: null,
          outTransactionId: uuid(),
          inTransactionId: uuid(),
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z',
        },
        201,
      ),
    });
    const { user } = await open('/dashboard?compose=transfer');
    const dialog = await drawer();
    expect(within(dialog).getByRole('combobox', { name: /From wallet/ })).toHaveValue('Checking');
    await user.click(within(dialog).getByRole('combobox', { name: /To wallet/ }));
    // The From wallet is not offered as a destination.
    expect(
      await screen.findByRole('option', { name: /Checking \(selected as From\)/ }),
    ).toHaveAttribute('aria-disabled', 'true');
    await user.click(screen.getByRole('option', { name: /^Savings/ }));
    await user.type(within(dialog).getByLabelText(/^Amount/), '200');
    await waitFor(() => expect(within(dialog).getByText('After this transfer')).toBeVisible());
    await waitFor(() =>
      expect(within(dialog).getAllByText(/\$1,000\.00/).length).toBeGreaterThan(0),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Move money' }));
    await waitFor(() => expect(mock.callsTo('POST /transfers')).toHaveLength(1));
    expect(mock.callsTo('POST /transfers')[0]?.body).toEqual({
      fromWalletId: CHECKING,
      toWalletId: SAVINGS,
      amountMinor: 20000,
      occurredOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      note: null,
    });
    const moved = await screen.findAllByText((text) =>
      text.includes('Moved $200.00 from Checking to Savings.'),
    );
    expect(moved.length).toBeGreaterThan(0);
    // Balances are refetched after success.
    await waitFor(() => expect(mock.callsTo('GET /wallets').length).toBeGreaterThan(1));
  });

  it('shows validation errors and requires the received amount across currencies', async () => {
    const mock = api();
    const { user } = await open(`/dashboard?compose=transfer`);
    const dialog = await drawer();
    await user.click(within(dialog).getByRole('button', { name: 'Move money' }));
    expect(await within(dialog).findByText('Choose a wallet.')).toBeVisible();
    expect(within(dialog).getByText('Enter an amount greater than 0.')).toBeVisible();
    await user.click(within(dialog).getByRole('combobox', { name: /To wallet/ }));
    await user.click(await screen.findByRole('option', { name: /^Euro/ }));
    expect(await within(dialog).findByLabelText(/They receive/)).toBeVisible();
    await user.type(within(dialog).getByLabelText(/^Amount/), '100');
    await user.click(within(dialog).getByRole('button', { name: 'Move money' }));
    expect(await within(dialog).findByText('Enter the amount they receive.')).toBeVisible();
    expect(mock.callsTo('POST /transfers')).toHaveLength(0);
  });

  it('swaps the wallets', async () => {
    api();
    const { user } = await open('/dashboard?compose=transfer');
    const dialog = await drawer();
    await user.click(within(dialog).getByRole('combobox', { name: /To wallet/ }));
    await user.click(await screen.findByRole('option', { name: /^Savings/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Swap From and To wallets' }));
    expect(within(dialog).getByRole('combobox', { name: /From wallet/ })).toHaveValue('Savings');
    expect(within(dialog).getByRole('combobox', { name: /To wallet/ })).toHaveValue('Checking');
  });
});

describe('edit, delete and read-only', () => {
  function seedTx(overrides: Partial<Transaction> = {}) {
    const tx = makeTransaction({
      wallet: wallets[0]!,
      category: categories[0]!,
      amountMinor: 5420,
      note: 'Weekly shop',
      ...overrides,
    });
    transactions = [tx];
    return tx;
  }

  it('edits a transaction and sends only the changed fields', async () => {
    const tx = seedTx();
    const mock = api({ [`GET /transactions/${tx.id}`]: ok(tx) } as never);
    mock.set(`GET /transactions/${tx.id}`, ok(tx));
    mock.set(`PATCH /transactions/${tx.id}`, ok({ ...tx, amountMinor: 6000 }));
    const { user } = await open(`/transactions?tx=${tx.id}`);
    const dialog = await screen.findByRole('dialog', { name: 'Edit expense' });
    const save = within(dialog).getByRole('button', { name: 'Save changes' });
    expect(save).toHaveAttribute('aria-disabled', 'true');
    const amount = within(dialog).getByLabelText(/Amount/);
    expect(amount).toHaveValue('54.20');
    await user.clear(amount);
    await user.type(amount, '60');
    await user.click(save);
    await waitFor(() => expect(mock.callsTo(`PATCH /transactions/${tx.id}`)).toHaveLength(1));
    expect(mock.callsTo(`PATCH /transactions/${tx.id}`)[0]?.body).toEqual({ amountMinor: 6000 });
  });

  it('requires confirmation before deleting and then removes the entry', async () => {
    const tx = seedTx();
    const mock = api();
    mock.set(`GET /transactions/${tx.id}`, ok(tx));
    mock.set(`DELETE /transactions/${tx.id}`, noContent());
    const { user } = await open(`/transactions?tx=${tx.id}`);
    const dialog = await screen.findByRole('dialog', { name: 'Edit expense' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete expense' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete this expense?' });
    expect(confirm).toHaveTextContent('Checking will go up by $54.20.');
    expect(mock.callsTo(`DELETE /transactions/${tx.id}`)).toHaveLength(0);
    await user.click(within(confirm).getByRole('button', { name: 'Delete expense' }));
    await waitFor(() => expect(mock.callsTo(`DELETE /transactions/${tx.id}`)).toHaveLength(1));
  });

  it('shows a read-only view for a transaction in an archived wallet', async () => {
    wallets = [{ ...wallets[0]!, archived: true }, ...wallets.slice(1)];
    const tx = seedTx({
      wallet: { id: CHECKING, name: 'Checking', currency: 'USD', archived: true },
    });
    const mock = api();
    mock.set(`GET /transactions/${tx.id}`, ok(tx));
    await open(`/transactions?tx=${tx.id}`);
    const dialog = await screen.findByRole('dialog', { name: 'Transaction' });
    expect(dialog).toHaveTextContent("can't be changed or deleted");
    expect(within(dialog).queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Duplicate' })).toBeVisible();
  });

  it('redirects the old deep links to the overlays', async () => {
    api();
    const { router } = await open('/transactions/new');
    await waitFor(() => expect(router.state.location.pathname).toBe('/transactions'));
    expect(router.state.location.search).toMatchObject({ compose: 'expense' });
  });

  it('opens the detail for a valid id from the redirect route', async () => {
    const tx = seedTx();
    const mock = api();
    mock.set(`GET /transactions/${tx.id}`, ok(tx));
    const { router } = await open(`/transactions/${tx.id}`);
    await waitFor(() => expect(router.state.location.search).toMatchObject({ tx: tx.id }));
  });

  it('never requests an API path for a non-UUID ?tx= on a non-ledger page', async () => {
    const mock = api();
    await open('/dashboard?tx=..%2Fwallets');
    await screen.findByRole('heading', { name: 'Dashboard' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mock.calls.filter((call) => call.path.startsWith('/transactions/'))).toHaveLength(0);
    expect(mock.calls.filter((call) => call.path.includes('wallets/'))).toHaveLength(0);
  });

  it('drops a traversal id in /transactions/<id> instead of redirecting with it', async () => {
    const mock = api();
    const { router } = await open('/transactions/..%2Fwallets');
    await waitFor(() => expect(router.state.location.pathname).toBe('/transactions'));
    expect(router.state.location.search).not.toHaveProperty('tx');
    expect(mock.calls.filter((call) => call.path.startsWith('/transactions/'))).toHaveLength(0);
  });
});

describe('quick add', () => {
  it('adds from the bar on desktop, resets amount and category, keeps wallet and date', async () => {
    const mock = api({
      'POST /transactions': ok(
        makeTransaction({ wallet: wallets[0]!, category: categories[0]! }),
        201,
      ),
    });
    const { user } = await open('/transactions', VIEWPORT.desktop);
    const bar = await screen.findByRole('form', { name: 'Quick add' });
    await user.type(within(bar).getByLabelText(/Amount/), '12.5');
    await user.click(within(bar).getByRole('combobox', { name: /Category/ }));
    await user.click(await screen.findByRole('option', { name: /Groceries/ }));
    await user.click(within(bar).getByRole('button', { name: 'Add expense' }));
    await waitFor(() => expect(mock.callsTo('POST /transactions')).toHaveLength(1));
    await waitFor(() => expect(within(bar).getByLabelText(/Amount/)).toHaveValue(''));
    expect(within(bar).getByLabelText(/Amount/)).toHaveFocus();
    expect(within(bar).getByRole('combobox', { name: /Wallet/ })).toHaveValue('Checking');
    expect(mock.callsTo('POST /transactions')[0]?.body).toMatchObject({ amountMinor: 1250 });
  });
});

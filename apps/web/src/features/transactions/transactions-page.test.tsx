import type { Category, Transaction, Wallet } from '@midas/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeCategory, makeTransaction, makeWallet, resetFixtureIds, uuid } from '@/test/fixtures';
import { mockApi, ok, problem, type MockRequest } from '@/test/mock-api';
import { renderApp, setViewport, signedInAs, VIEWPORT } from '@/test/helpers';
import { resetComposerSession } from './composer-store';

let wallets: Wallet[];
let categories: Category[];
let transactions: Transaction[];

function seed() {
  const checking = makeWallet({ id: uuid(801), name: 'Checking' });
  const savings = makeWallet({ id: uuid(802), name: 'Savings', type: 'savings' });
  const groceries = makeCategory({ id: uuid(811), name: 'Groceries' });
  const salary = makeCategory({ id: uuid(812), name: 'Salary', type: 'income', icon: 'briefcase' });
  wallets = [checking, savings];
  categories = [groceries, salary];
  transactions = [
    makeTransaction({
      wallet: checking,
      category: groceries,
      note: 'Weekly shop at the market',
      amountMinor: 5420,
      occurredOn: '2026-10-16',
    }),
    makeTransaction({
      wallet: checking,
      type: 'income',
      category: salary,
      note: null,
      amountMinor: 420000,
      occurredOn: '2026-10-16',
    }),
    makeTransaction({
      wallet: savings,
      type: 'expense',
      category: groceries,
      note: 'Old rent',
      amountMinor: 90000,
      occurredOn: '2026-09-30',
    }),
  ];
}

function matches(request: MockRequest, t: Transaction): boolean {
  const p = request.params;
  const types = p.getAll('type');
  const walletIds = p.getAll('walletId');
  const q = p.get('q')?.toLowerCase();
  return (
    (types.length === 0 || types.includes(t.type)) &&
    (walletIds.length === 0 || walletIds.includes(t.wallet.id)) &&
    (!q || (t.note ?? '').toLowerCase().includes(q))
  );
}

function ledgerApi(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /wallets': () => ok({ items: wallets }),
    'GET /categories': () => ok({ items: categories }),
    'GET /transactions': (request) => {
      const limit = Number(request.params.get('limit') ?? 25);
      const all = transactions.filter((t) => matches(request, t));
      const start = Number(request.params.get('cursor') ?? 0);
      const page = all.slice(start, start + limit);
      const next = start + limit < all.length ? String(start + limit) : null;
      return ok({ items: page, nextCursor: next });
    },
    ...extra,
  });
}

async function openLedger(path = '/transactions', viewport: number = VIEWPORT.desktop) {
  setViewport(viewport);
  signedInAs('user');
  const user = userEvent.setup();
  const utils = await renderApp(path);
  return { user, ...utils };
}

beforeEach(() => {
  resetFixtureIds();
  resetComposerSession();
  seed();
});

describe('ledger list', () => {
  it('groups by day and describes each row with a signed amount', async () => {
    ledgerApi();
    await openLedger();
    const list = await screen.findByRole('region', { name: 'Results' });
    expect(
      await within(list).findByRole('heading', { level: 3, name: /Yesterday|Today|Oct 16/ }),
    ).toBeVisible();
    expect(
      within(list).getByRole('link', {
        name: /Expense, Groceries, Checking, October 16, minus \$54\.20/,
      }),
    ).toBeVisible();
    expect(within(list).getByText('−$54.20')).toBeVisible();
    expect(within(list).getByText('+$4,200.00')).toBeVisible();
    // No note: the category names the row.
    expect(within(list).getAllByText('Salary').length).toBeGreaterThan(0);
    expect(screen.getByText('3 transactions.')).toBeVisible();
  });

  it('shows the empty ledger state with an Add action', async () => {
    transactions = [];
    ledgerApi();
    const { user } = await openLedger();
    expect(await screen.findByText('Your ledger is empty.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: /Add transaction/ }));
    expect(await screen.findByRole('dialog', { name: 'Add transaction' })).toBeVisible();
  });

  it('shows skeleton rows while loading, then an error with retry', async () => {
    mockApi({
      'GET /wallets': () => ok({ items: wallets }),
      'GET /categories': () => ok({ items: categories }),
    });
    await openLedger();
    expect(await screen.findByText(/Couldn't load transactions/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  it('loads more with a cursor and moves focus to the first new row', async () => {
    transactions = Array.from({ length: 30 }, (_, i) =>
      makeTransaction({
        wallet: wallets[0]!,
        category: categories[0]!,
        note: `Entry ${i + 1}`,
        occurredOn: '2026-10-16',
      }),
    );
    const api = ledgerApi();
    const { user } = await openLedger();
    expect(await screen.findByText('25 transactions shown, more available.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() => expect(screen.getByText('30 transactions.')).toBeVisible());
    expect(api.callsTo('GET /transactions').some((c) => c.params.get('cursor') === '25')).toBe(
      true,
    );
    expect(screen.getByRole('link', { name: /Entry 26/ })).toHaveFocus();
    expect(screen.getByText("You've reached the oldest transaction.")).toBeVisible();
  });

  function thirtyEntries() {
    transactions = Array.from({ length: 30 }, (_, i) =>
      makeTransaction({
        wallet: wallets[0]!,
        category: categories[0]!,
        note: `Entry ${i + 1}`,
        occurredOn: '2026-10-16',
      }),
    );
  }

  it('keeps focus and stays silent when Load more fails, then recovers on retry', async () => {
    thirtyEntries();
    let fail = true;
    const api = ledgerApi();
    api.set('GET /transactions', (request) => {
      if (request.params.get('cursor') === '25' && fail) return problem(500, 'INTERNAL_ERROR');
      const limit = Number(request.params.get('limit') ?? 25);
      const start = Number(request.params.get('cursor') ?? 0);
      const page = transactions.slice(start, start + limit);
      return ok({ items: page, nextCursor: start + limit < 30 ? String(start + limit) : null });
    });
    const { user } = await openLedger();
    await screen.findByText('25 transactions shown, more available.');
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText("Couldn't load more. Your list is unchanged.")).toBeVisible();
    expect(screen.queryByText(/more transactions loaded/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Entry 26/ })).not.toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByText('30 transactions.')).toBeVisible());
    expect(screen.getByRole('link', { name: /Entry 26/ })).toHaveFocus();
    expect(
      screen.queryByText("Couldn't load more. Your list is unchanged."),
    ).not.toBeInTheDocument();
  });

  it('does not show the Load more alert for a failed background refetch', async () => {
    const api = ledgerApi();
    const { queryClient } = await openLedger();
    await screen.findByText('3 transactions.');
    api.set('GET /transactions', problem(500, 'INTERNAL_ERROR'));
    await queryClient.invalidateQueries({ queryKey: ['transactions', 'list'] });
    await waitFor(() => expect(api.callsTo('GET /transactions').length).toBeGreaterThan(2));
    expect(
      screen.queryByText("Couldn't load more. Your list is unchanged."),
    ).not.toBeInTheDocument();
  });
});

describe('filters and URL state', () => {
  it('filters by type from the popover, updates the list and the URL, and removes via a chip', async () => {
    const api = ledgerApi();
    const { user, router } = await openLedger();
    await screen.findByText('3 transactions.');
    await user.click(screen.getByRole('button', { name: 'Type' }));
    const popover = await screen.findByRole('dialog', { name: 'Type' });
    await user.click(within(popover).getByRole('checkbox', { name: 'Income' }));
    await waitFor(() => expect(router.state.location.search).toEqual({ type: 'income' }));
    expect(await screen.findByText('1 transaction.')).toBeVisible();
    expect(
      api
        .callsTo('GET /transactions')
        .some((call) => call.params.getAll('type').join() === 'income'),
    ).toBe(true);
    await user.keyboard('{Escape}');
    const chip = await screen.findByRole('button', { name: 'Remove filter: Type Income' });
    await user.click(chip);
    await waitFor(() => expect(router.state.location.search).toEqual({}));
    expect(await screen.findByText('3 transactions.')).toBeVisible();
  });

  it('searches notes (debounced) into the URL and highlights matches', async () => {
    ledgerApi();
    const { user, router } = await openLedger();
    await screen.findByText('3 transactions.');
    await user.type(screen.getByLabelText('Search notes'), 'rent');
    await waitFor(() => expect(router.state.location.search).toEqual({ q: 'rent' }));
    expect(await screen.findByText('1 transaction.')).toBeVisible();
    expect(document.querySelector('mark')?.textContent).toBe('rent');
  });

  it('keeps a trailing space in the search box when the URL echoes the trimmed value', async () => {
    ledgerApi();
    const { user, router } = await openLedger();
    await screen.findByText('3 transactions.');
    const box = screen.getByLabelText('Search notes');
    await user.type(box, 'rent ');
    await waitFor(() => expect(router.state.location.search).toEqual({ q: 'rent' }));
    expect(box).toHaveValue('rent ');
  });

  it('does not overwrite filters changed while a search commit was pending', async () => {
    ledgerApi();
    const { router } = await openLedger();
    await screen.findByText('3 transactions.');
    const box = screen.getByLabelText('Search notes');
    fireEvent.change(box, { target: { value: 'rent' } });
    // A newer filter lands before the 300ms debounce fires.
    await router.navigate({ to: '/transactions', search: { type: ['expense'] } as never });
    await waitFor(() => expect(router.state.location.search).toMatchObject({ q: 'rent' }));
    expect(router.state.location.search).toMatchObject({ type: 'expense' });
    expect(box).toHaveValue('rent');
  });

  it('reads filters from the link, ignores invalid ones and says so', async () => {
    ledgerApi();
    await openLedger(`/transactions?wallet=${uuid(801)}&type=bogus`);
    expect(
      await screen.findByText("Some filters in the link weren't valid and were ignored."),
    ).toBeVisible();
    expect(
      await screen.findByRole('button', { name: 'Remove filter: Wallet Checking' }),
    ).toBeVisible();
  });

  it('explains an empty result and offers Clear filters', async () => {
    ledgerApi();
    const { user } = await openLedger('/transactions?q=zzz');
    expect(
      await screen.findByRole('heading', { name: 'No transactions match these filters.' }),
    ).toBeVisible();
    expect(screen.getByText('No notes contain "zzz".')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByText('3 transactions.')).toBeVisible();
  });

  it('disables the amount filter across currencies with a visible reason', async () => {
    wallets = [wallets[0]!, makeWallet({ id: uuid(803), name: 'Euro', currency: 'EUR' })];
    ledgerApi();
    await openLedger();
    const amount = await screen.findByRole('button', { name: 'Amount' });
    expect(amount).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Choose wallets in one currency to filter by amount.')).toBeVisible();
  });

  it('ignores the amount range across currencies, says so, and never sends it', async () => {
    wallets = [wallets[0]!, makeWallet({ id: uuid(803), name: 'Euro', currency: 'EUR' })];
    const api = ledgerApi();
    await openLedger('/transactions?min=100&max=5000');
    expect(await screen.findByText(/The amount filter was ignored/)).toBeVisible();
    await screen.findByText('3 transactions.');
    for (const call of api.callsTo('GET /transactions')) {
      expect(call.params.has('minAmountMinor')).toBe(false);
      expect(call.params.has('maxAmountMinor')).toBe(false);
    }
  });

  it('still sends the amount range for a single-currency scope', async () => {
    const api = ledgerApi();
    await openLedger('/transactions?min=100&max=5000');
    await screen.findByText('3 transactions.');
    expect(screen.queryByText(/The amount filter was ignored/)).not.toBeInTheDocument();
    expect(
      api.callsTo('GET /transactions').some((c) => c.params.get('minAmountMinor') === '100'),
    ).toBe(true);
  });

  it('stages filters in a sheet on mobile and applies them together', async () => {
    const { user, router } = await (async () => {
      ledgerApi();
      return openLedger('/transactions', VIEWPORT.mobile);
    })();
    await user.click(await screen.findByRole('button', { name: 'Filters (0)' }));
    const sheet = await screen.findByRole('dialog', { name: 'Filters' });
    await user.click(within(sheet).getByRole('checkbox', { name: 'Income' }));
    expect(router.state.location.search).toEqual({});
    await user.click(within(sheet).getByRole('button', { name: 'Show results' }));
    await waitFor(() => expect(router.state.location.search).toEqual({ type: 'income' }));
    expect(await screen.findByRole('button', { name: 'Filters (1)' })).toBeVisible();
  });

  it('renders the list on a phone without the quick-add bar or desktop popovers, and stays accessible', async () => {
    ledgerApi();
    const { container } = await openLedger('/transactions', VIEWPORT.mobile);
    await screen.findByText('3 transactions.');
    const list = screen.getByRole('region', { name: 'Results' });
    expect(within(list).getAllByRole('link').length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByRole('form', { name: 'Quick add' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Type/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filters (0)' })).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no detectable accessibility violations', async () => {
    ledgerApi();
    const { container } = await openLedger();
    await screen.findByText('3 transactions.');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no violations on a tablet', async () => {
    ledgerApi();
    const { container } = await openLedger('/transactions', VIEWPORT.tablet);
    await screen.findByText('3 transactions.');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no violations on desktop while the list is still loading', async () => {
    mockApi({
      'GET /wallets': () => ok({ items: wallets }),
      'GET /categories': () => ok({ items: categories }),
      'GET /transactions': () => new Promise<never>(() => undefined),
    });
    const { container } = await openLedger();
    await screen.findByText('Loading transactions.');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no violations when every wallet is archived', async () => {
    wallets = wallets.map((w) => ({ ...w, archived: true }));
    transactions = [];
    ledgerApi();
    const { container } = await openLedger();
    await screen.findByRole('heading', { name: 'Create a wallet before adding transactions.' });
    expect(await axe(container)).toHaveNoViolations();
  });
});

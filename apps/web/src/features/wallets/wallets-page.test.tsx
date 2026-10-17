import type { Wallet } from '@midas/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeWallet, resetFixtureIds } from '@/test/fixtures';
import { mockApi, noContent, ok, problem } from '@/test/mock-api';
import { renderApp, setViewport, signedInAs, VIEWPORT } from '@/test/helpers';

let wallets: Wallet[];

function seed(): Wallet[] {
  return [
    makeWallet({ name: 'Checking', type: 'bank', balanceMinor: 118000 }),
    makeWallet({ name: 'Visa', type: 'card', balanceMinor: -240000, hasTransactions: true }),
    makeWallet({
      name: 'Rainy day',
      type: 'savings',
      balanceMinor: -3500,
      openingBalanceMinor: -3500,
      hasTransactions: false,
    }),
    makeWallet({
      name: 'Old savings',
      type: 'savings',
      balanceMinor: 0,
      archived: true,
      archivedAt: '2026-09-01T00:00:00.000Z',
      hasTransactions: true,
    }),
  ];
}

function walletApi(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /wallets': () => ok({ items: wallets }),
    ...extra,
  });
}

async function openWallets(path = '/wallets', viewport: number = VIEWPORT.desktop) {
  setViewport(viewport);
  signedInAs('user');
  const user = userEvent.setup();
  const utils = await renderApp(path);
  return { user, ...utils };
}

beforeEach(() => {
  resetFixtureIds();
  wallets = seed();
});

describe('wallet list', () => {
  it('shows type, currency, balance with qualifiers and totals per currency', async () => {
    walletApi();
    await openWallets();
    const table = await screen.findByRole('table', { name: 'Wallets' });
    for (const header of ['Wallet', 'Type', 'Currency', 'Balance']) {
      expect(within(table).getByRole('columnheader', { name: header })).toBeVisible();
    }
    const visa = within(table).getByRole('row', { name: /Visa/ });
    expect(within(visa).getByText('Card')).toBeVisible();
    expect(within(visa).getByText('owed')).toBeVisible();
    expect(within(visa).getByText('−$2,400.00')).toBeVisible();
    const rainy = within(table).getByRole('row', { name: /Rainy day/ });
    expect(within(rainy).getByText('Overdrawn')).toBeVisible();
    expect(within(rainy).getByText('−$35.00')).toBeVisible();
    // 1,180.00 - 2,400.00 - 35.00 = -1,255.00 (active wallets only, cards netted)
    const totals = screen.getByRole('region', { name: 'Total balance' });
    expect(totals).toHaveTextContent('−$1,255.00');
    expect(screen.queryByText('Old savings')).not.toBeInTheDocument();
  });

  it('toggles archived wallets and keeps the choice in the URL', async () => {
    walletApi();
    const { user, router } = await openWallets();
    const toggle = await screen.findByRole('switch', { name: 'Show archived (1)' });
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    expect(await screen.findByRole('heading', { name: 'Archived (1)' })).toBeVisible();
    expect(screen.getByText('Old savings')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Unarchive' })).toBeVisible();
    expect(router.state.location.search).toEqual({ archived: '1' });
  });

  it('opens with the archived section when the link says so, ignoring unknown values', async () => {
    walletApi();
    await openWallets('/wallets?archived=1');
    expect(await screen.findByRole('heading', { name: 'Archived (1)' })).toBeVisible();
  });

  it('shows the empty state with a create action', async () => {
    wallets = [];
    walletApi();
    await openWallets();
    expect(await screen.findByText('Wallets are where your money lives.')).toBeVisible();
    expect(screen.getAllByRole('link', { name: 'Create wallet' })[0]).toHaveAttribute(
      'href',
      '/wallets/new',
    );
  });

  it('shows a retryable error when loading fails', async () => {
    mockApi({ 'GET /wallets': problem(500, 'INTERNAL_ERROR') });
    await openWallets();
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your wallets");
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: 'Wallets' })).toBeVisible();
  });

  it('uses the list layout when the container is narrow', async () => {
    walletApi();
    const original = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      return {
        width: 360,
        height: 100,
        top: 0,
        left: 0,
        right: 360,
        bottom: 100,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      };
    };
    try {
      await openWallets();
      expect(await screen.findByRole('list', { name: 'Wallets' })).toBeVisible();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    } finally {
      Element.prototype.getBoundingClientRect = original;
    }
  });

  it('has no detectable accessibility violations', async () => {
    walletApi();
    const { container } = await openWallets();
    await screen.findByRole('table', { name: 'Wallets' });
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no detectable accessibility violations at mobile width', async () => {
    walletApi();
    const { container } = await openWallets('/wallets', VIEWPORT.mobile);
    await screen.findByRole('heading', { level: 1, name: 'Wallets' });
    await screen.findByText(wallets[0]!.name);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('create and edit', () => {
  it('validates the form, lists the problems and sends nothing', async () => {
    const api = walletApi();
    const { user } = await openWallets('/wallets/new');
    const dialog = await screen.findByRole('dialog', { name: 'Create wallet' });
    expect(within(dialog).getByLabelText(/Name/)).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Create wallet' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('2 things need fixing');
    expect(within(dialog).getByText('Enter a name.')).toBeVisible();
    expect(within(dialog).getByText('Choose a type.')).toBeVisible();
    expect(within(dialog).getByLabelText(/Name/)).toHaveFocus();
    expect(api.callsTo('POST /wallets')).toHaveLength(0);
  });

  it('creates a wallet with the typed opening balance and highlights it', async () => {
    const created = makeWallet({ name: 'Everyday', type: 'cash', balanceMinor: 5000 });
    const api = walletApi({
      'POST /wallets': () => {
        wallets = [...wallets, created];
        return ok(created, 201);
      },
    });
    const { user, router } = await openWallets('/wallets/new');
    const dialog = await screen.findByRole('dialog', { name: 'Create wallet' });
    await user.type(within(dialog).getByLabelText(/Name/), '  Everyday ');
    await user.click(within(dialog).getByRole('radio', { name: /Cash/ }));
    await user.type(within(dialog).getByLabelText('Opening balance'), '50');
    await user.click(within(dialog).getByRole('button', { name: 'Create wallet' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/wallets'));
    expect(api.callsTo('POST /wallets')[0]?.body).toEqual({
      name: 'Everyday',
      type: 'cash',
      currency: 'USD',
      openingBalanceMinor: 5000,
    });
    const link = await screen.findByRole('link', { name: 'Everyday' });
    await waitFor(() => expect(link).toHaveFocus());
  });

  it('shows a duplicate name on the name field and keeps the input', async () => {
    walletApi({ 'POST /wallets': problem(409, 'WALLET_NAME_TAKEN') });
    const { user } = await openWallets('/wallets/new');
    const dialog = await screen.findByRole('dialog', { name: 'Create wallet' });
    await user.type(within(dialog).getByLabelText(/Name/), 'Checking');
    await user.click(within(dialog).getByRole('radio', { name: /Bank/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Create wallet' }));
    expect(
      await within(dialog).findByText('You already have a wallet with this name.'),
    ).toBeVisible();
    expect(within(dialog).getByLabelText(/Name/)).toHaveValue('Checking');
    expect(within(dialog).getByLabelText(/Name/)).toHaveFocus();
  });

  it('asks before discarding a dirty form', async () => {
    walletApi();
    const { user } = await openWallets('/wallets/new');
    const dialog = await screen.findByRole('dialog', { name: 'Create wallet' });
    await user.type(within(dialog).getByLabelText(/Name/), 'Draft');
    await user.keyboard('{Escape}');
    const confirm = await screen.findByRole('alertdialog', { name: 'Discard this wallet?' });
    expect(within(confirm).getByRole('button', { name: 'Keep editing' })).toHaveFocus();
    await user.click(within(confirm).getByRole('button', { name: 'Discard' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Create wallet' })).not.toBeInTheDocument(),
    );
  });

  it('edits only what changed and explains the balance effect', async () => {
    const target = wallets[0]!;
    const api = walletApi({
      'PATCH /wallets/:id': () => ok(target),
    });
    api.set(`PATCH /wallets/${target.id}`, (request) => {
      const body = request.body as Partial<Wallet>;
      wallets = wallets.map((wallet) =>
        wallet.id === target.id ? { ...wallet, ...body } : wallet,
      );
      return ok({ ...target, ...body });
    });
    const { user } = await openWallets(`/wallets/${target.id}/edit`);
    const dialog = await screen.findByRole('dialog', { name: 'Edit wallet' });
    const save = within(dialog).getByRole('button', { name: 'Save changes' });
    expect(save).toHaveAttribute('aria-disabled', 'true');
    expect(within(dialog).getByText('No changes to save.')).toBeVisible();
    expect(within(dialog).getByText('$1,180.00', { selector: 'dd' })).toBeVisible();
    const opening = within(dialog).getByLabelText('Opening balance');
    await user.clear(opening);
    await user.type(opening, '1200');
    expect(within(dialog).getByRole('status')).toHaveTextContent(
      'Balance will change from $1,180.00 to $1,380.00.',
    );
    await user.click(save);
    await waitFor(() =>
      expect(api.callsTo(`PATCH /wallets/${target.id}`)[0]?.body).toEqual({
        openingBalanceMinor: 120000,
      }),
    );
  });

  it('locks the currency when the wallet has transactions', async () => {
    walletApi();
    await openWallets(`/wallets/${wallets[0]!.id}/edit`);
    const dialog = await screen.findByRole('dialog', { name: 'Edit wallet' });
    expect(within(dialog).getByRole('combobox', { name: /Currency/ })).toBeDisabled();
    expect(
      within(dialog).getByText("Currency can't change because this wallet has transactions."),
    ).toBeVisible();
  });

  it('says so when the wallet in the link does not exist', async () => {
    walletApi();
    const { router } = await openWallets('/wallets/00000000-0000-4000-8000-0000000000ff/edit');
    expect(await screen.findByText("That wallet doesn't exist.")).toBeVisible();
    await waitFor(() => expect(router.state.location.pathname).toBe('/wallets'));
  });
});

async function openRowMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole('button', { name: `Actions for ${name}` }));
}

describe('archive, unarchive and delete', () => {
  it('requires confirmation to archive, lists the consequences and focuses Cancel', async () => {
    const target = wallets[0]!;
    const api = walletApi();
    api.set(`POST /wallets/${target.id}/archive`, () => {
      wallets = wallets.map((wallet) =>
        wallet.id === target.id
          ? { ...wallet, archived: true, archivedAt: '2026-10-17T00:00:00.000Z' }
          : wallet,
      );
      return ok({ ...target, archived: true, archivedAt: '2026-10-17T00:00:00.000Z' });
    });
    const { user } = await openWallets();
    await openRowMenu(user, 'Checking');
    await user.click(await screen.findByRole('menuitem', { name: 'Archive wallet' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Archive Checking?' });
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(dialog).toHaveTextContent('stops counting toward your total balance');
    expect(dialog).toHaveTextContent('$1,180.00');
    expect(dialog).toHaveTextContent('You can unarchive it at any time.');
    expect(api.callsTo(`POST /wallets/${target.id}/archive`)).toHaveLength(0);

    await user.click(within(dialog).getByRole('button', { name: 'Archive wallet' }));
    expect(await screen.findByText('Checking archived.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeVisible();
    expect(api.callsTo(`POST /wallets/${target.id}/archive`)).toHaveLength(1);
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Checking' })).not.toBeInTheDocument(),
    );
  });

  it('does not archive when the dialog is cancelled', async () => {
    const target = wallets[0]!;
    const api = walletApi();
    const { user } = await openWallets();
    await openRowMenu(user, 'Checking');
    await user.click(await screen.findByRole('menuitem', { name: 'Archive wallet' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Archive Checking?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(api.callsTo(`POST /wallets/${target.id}/archive`)).toHaveLength(0);
    expect(screen.getByRole('link', { name: 'Checking' })).toBeVisible();
  });

  it('unarchives from the row without a dialog', async () => {
    const target = wallets[3]!;
    const api = walletApi();
    api.set(`POST /wallets/${target.id}/unarchive`, () => ok({ ...target, archived: false }));
    const { user } = await openWallets('/wallets?archived=1');
    await user.click(await screen.findByRole('button', { name: 'Unarchive' }));
    await waitFor(() =>
      expect(api.callsTo(`POST /wallets/${target.id}/unarchive`)).toHaveLength(1),
    );
    expect(await screen.findByText('Old savings unarchived.')).toBeVisible();
  });

  it('offers delete only for wallets without transactions and explains why otherwise', async () => {
    walletApi();
    const { user } = await openWallets();
    await openRowMenu(user, 'Checking');
    const disabled = await screen.findByRole('menuitem', { name: /Delete is unavailable/ });
    expect(disabled).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByRole('menuitem', { name: 'Delete wallet' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    await openRowMenu(user, 'Rainy day');
    expect(await screen.findByRole('menuitem', { name: 'Delete wallet' })).toBeVisible();
  });

  it('deletes after confirmation and handles a wallet still used by recurring items', async () => {
    const target = wallets[2]!;
    const api = walletApi({});
    api.set(`DELETE /wallets/${target.id}`, problem(409, 'WALLET_IN_USE'));
    const { user } = await openWallets();
    await openRowMenu(user, 'Rainy day');
    await user.click(await screen.findByRole('menuitem', { name: 'Delete wallet' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete Rainy day?' });
    expect(dialog).toHaveTextContent("This can't be undone. It has no transactions.");
    await user.click(within(dialog).getByRole('button', { name: 'Delete wallet' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('used by recurring');
    expect(within(dialog).getByRole('button', { name: 'Archive wallet' })).toBeVisible();

    api.set(`DELETE /wallets/${target.id}`, () => {
      wallets = wallets.filter((wallet) => wallet.id !== target.id);
      return noContent();
    });
    await user.click(within(dialog).getByRole('button', { name: 'Delete wallet' }));
    expect(await screen.findAllByText('Wallet deleted.')).not.toHaveLength(0);
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Rainy day' })).not.toBeInTheDocument(),
    );
  });
});

describe('strict CSP', () => {
  it('adds no style element or style attribute when overlays open', async () => {
    walletApi();
    const before = document.head.querySelectorAll('style').length;
    const { user } = await openWallets('/wallets/new');
    const dialog = await screen.findByRole('dialog', { name: 'Create wallet' });
    await user.click(within(dialog).getByRole('combobox', { name: /Currency/ }));
    await screen.findByRole('listbox');
    expect(document.head.querySelectorAll('style')).toHaveLength(before);
    // Radix positions overlays through the DOM API (allowed by the CSP); the app authors none.
    const authored = [...document.querySelectorAll('[style]')].filter(
      (element) =>
        !element.hasAttribute('data-radix-focus-guard') &&
        !element.hasAttribute('data-radix-popper-content-wrapper') &&
        !/^(\s*--radix-[\w-]+:[^;]+;?)+\s*$/.test(element.getAttribute('style') ?? '') &&
        !element.closest('[aria-label^="Notifications"]'),
    );
    expect(authored).toEqual([]);
  });
});

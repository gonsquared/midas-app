import type { Budget } from '@midas/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp, setViewport, signedInAs, VIEWPORT } from '@/test/helpers';
import { makeBudget, makeCategory, makeWallet, resetFixtureIds } from '@/test/fixtures';
import { mockApi, noContent, ok, problem } from '@/test/mock-api';

let budgets: Budget[];
const groceries = makeCategory({ name: 'Groceries' });
const dining = makeCategory({ name: 'Dining out' });

function budgetApi(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /budgets': () => ok({ date: '2026-10-16', items: budgets }),
    'GET /categories': ok({ items: [groceries, dining] }),
    'GET /wallets': ok({ items: [makeWallet()] }),
    ...extra,
  });
}

async function openBudgets(path = '/budgets') {
  setViewport(VIEWPORT.desktop);
  signedInAs('user');
  const user = userEvent.setup();
  const utils = await renderApp(path);
  return { user, ...utils };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));
  resetFixtureIds();
  budgets = [
    makeBudget({ name: 'Groceries', spentMinor: 44520 }),
    makeBudget({ name: 'Dining out', amountMinor: 30000, spentMinor: 25500 }),
    makeBudget({ name: 'Transport', spentMinor: 8000 }),
    makeBudget({ overall: true, amountMinor: 400000, spentMinor: 310040 }),
  ];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('budget list and warnings', () => {
  it('groups budgets by attention and shows state with icon text and numbers', async () => {
    budgetApi();
    await openBudgets();
    const attention = await screen.findByRole('region', { name: 'Needs attention (2)' });
    const over = within(attention).getAllByRole('listitem')[0]!;
    expect(over).toHaveTextContent('Groceries');
    expect(over).toHaveTextContent('Over by $45.20');
    expect(over).toHaveTextContent('$445.20 spent of $400.00 limit');
    expect(
      within(over).getByRole('meter', { name: 'Groceries budget, monthly, USD' }),
    ).toHaveAttribute('aria-valuetext', expect.stringContaining('$445.20 of $400.00'));
    expect(within(over).getByTestId('budget-overflow')).toBeInTheDocument();
    const near = within(attention).getAllByRole('listitem')[1]!;
    expect(near).toHaveTextContent('Near limit, 85% used');
    expect(near).toHaveTextContent('$45.00 left');
    expect(near).toHaveTextContent('15 days to go');
    const onTrack = screen.getByRole('region', { name: 'On track (2)' });
    expect(within(onTrack).getAllByRole('listitem')[0]).toHaveTextContent('Overall');
  });

  it('announces one summary of the budgets that need attention', async () => {
    budgetApi();
    await openBudgets();
    await screen.findByRole('region', { name: 'Needs attention (2)' });
    await waitFor(() =>
      expect(
        screen.getAllByText(
          '2 budgets need attention: Groceries is over its limit, Dining out is near its limit.',
        ).length,
      ).toBeGreaterThan(0),
    );
  });

  it('shows the empty state with a create action', async () => {
    budgets = [];
    budgetApi();
    await openBudgets();
    expect(await screen.findByText('Budgets help you spend with a plan.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Create budget' })).toBeVisible();
  });

  it('shows an error with retry', async () => {
    budgetApi({ 'GET /budgets': problem(500, 'INTERNAL_ERROR') });
    await openBudgets();
    expect(await screen.findByText(/Couldn't load your budgets/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  it('has no axe violations', async () => {
    budgetApi();
    const { container } = await openBudgets();
    await screen.findByRole('region', { name: 'Needs attention (2)' });
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('period navigation', () => {
  it('moves by month, keeps the choice in the URL and fetches that period', async () => {
    const api = budgetApi();
    const { user, router } = await openBudgets();
    expect(await screen.findByTestId('budget-period-label')).toHaveTextContent('October 2026');
    await user.click(screen.getByRole('button', { name: 'Previous period' }));
    await waitFor(() =>
      expect(screen.getByTestId('budget-period-label')).toHaveTextContent('September 2026'),
    );
    expect(router.state.location.search).toEqual({ date: '2026-09-01' });
    await waitFor(() =>
      expect(api.callsTo('GET /budgets').some((c) => c.params.get('date') === '2026-09-01')).toBe(
        true,
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Today' }));
    await waitFor(() =>
      expect(screen.getByTestId('budget-period-label')).toHaveTextContent('October 2026'),
    );
  });

  it('switches to weekly and steps by week', async () => {
    budgetApi();
    const { user } = await openBudgets();
    await screen.findByTestId('budget-period-label');
    await user.click(screen.getByRole('radio', { name: 'Weekly' }));
    await waitFor(() =>
      expect(screen.getByTestId('budget-period-label')).toHaveTextContent('Week of Oct 12'),
    );
    await user.click(screen.getByRole('button', { name: 'Next period' }));
    await waitFor(() =>
      expect(screen.getByTestId('budget-period-label')).toHaveTextContent('Week of Oct 19'),
    );
  });
});

describe('create, edit and delete', () => {
  it('creates a category budget with a live threshold preview', async () => {
    budgets = [];
    const created = makeBudget({ name: 'Groceries', amountMinor: 40000, spentMinor: 0 });
    const api = budgetApi({
      'POST /budgets': () => {
        budgets = [created];
        return ok(created, 201);
      },
    });
    const { user } = await openBudgets();
    await user.click(await screen.findByRole('button', { name: 'Create budget' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create budget' });
    await user.click(within(dialog).getByRole('radio', { name: 'One category' }));
    await user.selectOptions(within(dialog).getByLabelText(/Category/), 'Groceries');
    await user.type(within(dialog).getByLabelText(/^Limit/), '400.00');
    expect(within(dialog).getByTestId('budget-preview')).toHaveTextContent(
      '80% = $320.00 and over shows "Near limit"',
    );
    const threshold = within(dialog).getByLabelText(/Warn me at/);
    await user.clear(threshold);
    await user.type(threshold, '90');
    expect(within(dialog).getByTestId('budget-preview')).toHaveTextContent('90% = $360.00');
    await user.click(within(dialog).getByRole('button', { name: 'Create budget' }));
    await waitFor(() => expect(api.callsTo('POST /budgets')).toHaveLength(1));
    expect(api.callsTo('POST /budgets')[0]!.body).toEqual({
      scope: 'category',
      categoryId: groceries.id,
      period: 'monthly',
      amountMinor: 40000,
      currency: 'USD',
      warningThresholdPct: 90,
    });
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Create budget' })).not.toBeInTheDocument(),
    );
    expect(await screen.findByRole('region', { name: 'On track (1)' })).toBeVisible();
  });

  it('validates before sending and disables categories that already have a budget', async () => {
    const api = budgetApi();
    const { user } = await openBudgets();
    await user.click(await screen.findByRole('button', { name: 'Create budget' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create budget' });
    await user.click(within(dialog).getByRole('radio', { name: 'One category' }));
    expect(
      within(dialog).getByRole('option', { name: 'Groceries (Already has a budget)' }),
    ).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Create budget' }));
    expect(await within(dialog).findAllByText('Choose a category.')).not.toHaveLength(0);
    expect(within(dialog).getAllByText('Enter an amount greater than 0.')).not.toHaveLength(0);
    expect(api.callsTo('POST /budgets')).toHaveLength(0);
  });

  it('shows BUDGET_EXISTS on the category field and keeps the input', async () => {
    budgetApi({ 'POST /budgets': problem(409, 'BUDGET_EXISTS') });
    const { user } = await openBudgets();
    await user.click(await screen.findByRole('button', { name: 'Create budget' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create budget' });
    await user.click(within(dialog).getByRole('radio', { name: 'One category' }));
    await user.selectOptions(within(dialog).getByLabelText(/Category/), 'Dining out');
    await user.type(within(dialog).getByLabelText(/^Limit/), '100');
    await user.click(within(dialog).getByRole('button', { name: 'Create budget' }));
    expect(
      await within(dialog).findByText('You already have a budget for this category and period.'),
    ).toBeVisible();
    expect(within(dialog).getByLabelText(/^Limit/)).toHaveValue('100');
  });

  it('edits only the limit and threshold and sends the changed fields', async () => {
    const api = budgetApi({});
    const target = budgets[0]!;
    api.set(`PATCH /budgets/${target.id}`, () => ok({ ...target, amountMinor: 50000 }));
    const { user } = await openBudgets();
    await user.click(await screen.findByRole('button', { name: 'Actions for Groceries budget' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit budget' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit budget' });
    expect(within(dialog).getByText(/To change these, delete the budget/)).toBeVisible();
    expect(within(dialog).getByText(/also changes how past periods look/)).toBeVisible();
    const limit = within(dialog).getByLabelText(/^Limit/);
    await user.clear(limit);
    await user.type(limit, '500');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.callsTo(`PATCH /budgets/${target.id}`)).toHaveLength(1));
    expect(api.callsTo(`PATCH /budgets/${target.id}`)[0]!.body).toEqual({ amountMinor: 50000 });
  });

  it('deletes after confirmation and says transactions are untouched', async () => {
    const target = budgets[2]!;
    const api = budgetApi({
      [`DELETE /budgets/${target.id}`]: () => {
        budgets = budgets.filter((b) => b.id !== target.id);
        return noContent();
      },
    });
    const { user } = await openBudgets();
    await user.click(await screen.findByRole('button', { name: 'Actions for Transport budget' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete budget' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete Transport budget?' });
    expect(confirm).toHaveTextContent("Your transactions aren't affected.");
    expect(within(confirm).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(within(confirm).getByRole('button', { name: 'Delete budget' }));
    await waitFor(() => expect(api.callsTo(`DELETE /budgets/${target.id}`)).toHaveLength(1));
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: /On track \(2\)/ })).not.toBeInTheDocument(),
    );
  });

  it('opens dialogs without injecting style elements', async () => {
    budgetApi();
    const before = document.head.querySelectorAll('style').length;
    const { user } = await openBudgets();
    await user.click(await screen.findByRole('button', { name: 'Create budget' }));
    await screen.findByRole('dialog', { name: 'Create budget' });
    expect(document.head.querySelectorAll('style')).toHaveLength(before);
  });
});

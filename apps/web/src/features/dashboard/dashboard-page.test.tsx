import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { renderApp, setViewport, signedInAs, VIEWPORT } from '@/test/helpers';
import {
  makeBudget,
  makeCategory,
  makeTemplate,
  makeTransaction,
  makeWallet,
  resetFixtureIds,
} from '@/test/fixtures';
import { mockApi, ok, problem } from '@/test/mock-api';

const groceries = makeCategory({ name: 'Groceries' });

function buckets() {
  return ['2026-10-01', '2026-10-08', '2026-10-15'].map((start, i) => ({
    periodStart: start,
    periodEnd: start,
    incomeMinor: i === 0 ? 420000 : 0,
    expenseMinor: 100000 * (i + 1),
    netMinor: (i === 0 ? 420000 : 0) - 100000 * (i + 1),
  }));
}

function summaryBody(extra: Record<string, unknown> = {}) {
  const wallet = makeWallet({ name: 'Checking', balanceMinor: 1248020 });
  return {
    from: '2026-10-01',
    to: '2026-10-31',
    wallets: [wallet, makeWallet({ name: 'Visa', type: 'card', balanceMinor: -240000 })],
    totalsByCurrency: [
      {
        currency: 'USD',
        balanceMinor: 1008020,
        incomeMinor: 420000,
        expenseMinor: 310040,
        netMinor: 109960,
      },
    ],
    recentTransactions: [
      makeTransaction({ note: 'Weekly shop', category: groceries, amountMinor: 5420, wallet }),
    ],
    budgets: [
      makeBudget({ name: 'Groceries', spentMinor: 44520 }),
      makeBudget({ name: 'Dining out', amountMinor: 30000, spentMinor: 25500 }),
    ],
    ...extra,
  };
}

function dashboardApi(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /reports/summary': () => ok(summaryBody()),
    'GET /reports/trend': ok({
      from: '2026-10-01',
      to: '2026-10-31',
      groupBy: 'week',
      currency: 'USD',
      buckets: buckets(),
    }),
    'GET /reports/category-breakdown': ok({
      from: '2026-10-01',
      to: '2026-10-31',
      type: 'expense',
      currency: 'USD',
      totalMinor: 310040,
      items: [{ category: groceries, amountMinor: 210040, percentage: 67.75, transactionCount: 9 }],
      other: { amountMinor: 100000, percentage: 32.25, categoryCount: 3 },
    }),
    'GET /recurring-templates': ok({
      items: [makeTemplate({ name: 'Rent', nextRunOn: '2026-10-28' })],
    }),
    ...extra,
  });
}

async function openDashboard(path = '/dashboard') {
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
});
afterEach(() => vi.useRealTimers());

describe('dashboard summary', () => {
  it('shows balance, the income minus expenses equation, wallets, budgets and recent activity', async () => {
    const api = dashboardApi();
    await openDashboard();
    const hero = await screen.findByTestId('hero-balance');
    expect(hero).toHaveTextContent('$10,080.20');
    const position = screen.getByRole('region', { name: /Total balance/ });
    expect(
      within(position).getByLabelText(/Income \$4,200.00 minus expenses \$3,100.40/),
    ).toBeVisible();
    expect(within(position).getByText('Day 16 of 31')).toBeVisible();
    expect(screen.getByRole('region', { name: 'Wallets' })).toHaveTextContent('Visa');
    const budgets = screen.getAllByTestId('dashboard-budget');
    expect(budgets[0]).toHaveTextContent('Groceries');
    expect(budgets[0]).toHaveTextContent('Over by $45.20');
    expect(screen.getByRole('region', { name: 'Recent activity' })).toHaveTextContent(
      'Weekly shop',
    );
    expect(screen.getByRole('region', { name: /Coming up/ })).toHaveTextContent('Rent');
    const summaryCall = api.callsTo('GET /reports/summary')[0]!;
    expect(summaryCall.params.get('from')).toBe('2026-10-01');
    expect(summaryCall.params.get('to')).toBe('2026-10-31');
  });

  it('lists budgets that need attention in a labeled region, not an alert', async () => {
    dashboardApi();
    await openDashboard();
    const strip = await screen.findByRole('region', { name: 'Needs attention' });
    expect(strip).toHaveTextContent('Groceries is over its monthly budget by $45.20.');
    expect(strip).toHaveTextContent('Dining out is at 85% of its monthly budget.');
    expect(within(strip).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(strip).getByRole('link', { name: 'View budgets' })).toBeVisible();
  });

  it('shows the first-run panel when there are no wallets', async () => {
    dashboardApi({
      'GET /reports/summary': () =>
        ok(summaryBody({ wallets: [], totalsByCurrency: [], recentTransactions: [], budgets: [] })),
    });
    await openDashboard();
    expect(await screen.findByText(/Create a wallet to get your numbers moving/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Create a wallet' })).toBeVisible();
  });

  it('shows a loading skeleton then an error with retry', async () => {
    dashboardApi({ 'GET /reports/summary': problem(500, 'INTERNAL_ERROR') });
    await openDashboard();
    expect(await screen.findByText(/Couldn't load your dashboard/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  it('has no axe violations', async () => {
    dashboardApi();
    const { container } = await openDashboard();
    await screen.findByTestId('hero-balance');
    await screen.findByTestId('trend-chart');
    expect(await axe(container)).toHaveNoViolations();
  });
});

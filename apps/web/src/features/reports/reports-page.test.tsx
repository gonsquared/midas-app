import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { renderApp, setViewport, signedInAs, VIEWPORT } from '@/test/helpers';
import { makeCategory, makeWallet, resetFixtureIds } from '@/test/fixtures';
import { mockApi, ok, problem } from '@/test/mock-api';

// The first test pays for the lazily imported chart chunk (about 1.7 s on an idle machine). With
// the whole suite and the API tests running at once it timed out at 20 s, so allow more headroom.
vi.setConfig({ testTimeout: 60_000 });

const groceries = makeCategory({ name: 'Groceries', color: 'green' });
const trend = {
  from: '2026-10-01',
  to: '2026-10-31',
  groupBy: 'week',
  currency: 'USD',
  buckets: [
    {
      periodStart: '2026-10-05',
      periodEnd: '2026-10-11',
      incomeMinor: 420000,
      expenseMinor: 100000,
      netMinor: 320000,
    },
  ],
};

function reportsApi(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /reports/summary': ok({
      from: '2026-10-01',
      to: '2026-10-31',
      wallets: [makeWallet()],
      totalsByCurrency: [
        {
          currency: 'USD',
          balanceMinor: 100,
          incomeMinor: 420000,
          expenseMinor: 310040,
          netMinor: 109960,
        },
      ],
      recentTransactions: [],
      budgets: [],
    }),
    'GET /reports/trend': ok(trend),
    'GET /reports/category-breakdown': ok({
      from: '2026-10-01',
      to: '2026-10-31',
      type: 'expense',
      currency: 'USD',
      totalMinor: 310040,
      items: [{ category: groceries, amountMinor: 210040, percentage: 67.75, transactionCount: 9 }],
      other: { amountMinor: 100000, percentage: 32.25, categoryCount: 3 },
    }),
    ...extra,
  });
}

async function openReports(path = '/reports') {
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

describe('reports page', () => {
  it('shows the equation, a derived sentence, ranked bars that link to transactions, and export', async () => {
    reportsApi();
    const { container } = await openReports();
    const summary = await screen.findByRole('region', { name: 'Summary' });
    expect(summary).toHaveTextContent('Income $4,200.00');
    expect(summary).toHaveTextContent('Net +$1,099.60');
    expect(summary).toHaveTextContent('You kept 26% of your income.');
    const bars = await screen.findByTestId('category-breakdown');
    const link = within(bars).getByRole('link', { name: /Groceries, \$2,100.40, 68%/ });
    expect(link.getAttribute('href')).toContain('/transactions');
    expect(link.getAttribute('href')).toContain('from=2026-10-01');
    expect(within(bars).getByText('Other (3 categories)')).toBeVisible();
    expect(bars).toHaveTextContent('Total $3,100.40. Transfers excluded.');
    expect(
      screen.getByRole('button', { name: 'Export transactions for this range' }),
    ).toBeVisible();
    await screen.findByTestId('trend-chart');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('switches the breakdown to a table with two-decimal shares', async () => {
    reportsApi();
    const { user } = await openReports();
    const bars = await screen.findByTestId('category-breakdown');
    await user.click(within(bars).getByRole('radio', { name: 'Table' }));
    const table = within(bars).getByRole('table');
    expect(table).toHaveTextContent('67.75%');
    expect(table).toHaveTextContent('32.25%');
  });

  it('keeps the range in the URL and requests it', async () => {
    const api = reportsApi();
    const { user, router } = await openReports();
    await screen.findByTestId('range-label');
    await user.selectOptions(screen.getByLabelText('Range'), 'last-30');
    await waitFor(() => expect(router.state.location.search).toEqual({ range: 'last-30' }));
    await waitFor(() =>
      expect(
        api.callsTo('GET /reports/summary').some((c) => c.params.get('from') === '2026-09-17'),
      ).toBe(true),
    );
  });

  it('suggests a coarser grouping when the range has too many buckets', async () => {
    reportsApi({ 'GET /reports/trend': problem(400, 'RANGE_TOO_LARGE') });
    await openReports('/reports?group=day');
    expect(await screen.findByText('That is too many periods to chart.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Group by week' })).toBeVisible();
  });

  it('validates a custom range before applying it', async () => {
    reportsApi();
    const { user } = await openReports();
    await screen.findByTestId('range-label');
    await user.selectOptions(screen.getByLabelText('Range'), 'custom');
    const form = await screen.findByRole('form', { name: 'Custom range' });
    await user.clear(within(form).getByLabelText('From'));
    await user.click(within(form).getByRole('button', { name: 'Apply range' }));
    expect(await within(form).findByText('Choose both a start and an end date.')).toBeVisible();
  });
});

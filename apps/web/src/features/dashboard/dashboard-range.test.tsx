import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp, setViewport, signedInAs, VIEWPORT } from '@/test/helpers';
import { makeWallet, resetFixtureIds } from '@/test/fixtures';
import { mockApi, ok, type MockRoutes } from '@/test/mock-api';

type Key = keyof MockRoutes;

// QA gate E7-F2-S4: the selected range reaches every dashboard widget and lives in the URL.
const wallet = makeWallet({ name: 'Checking', balanceMinor: 1000 });

function api() {
  return mockApi({
    'GET /reports/summary': ok({
      from: '2026-09-01',
      to: '2026-09-30',
      wallets: [wallet],
      totalsByCurrency: [
        { currency: 'USD', balanceMinor: 1000, incomeMinor: 0, expenseMinor: 0, netMinor: 0 },
      ],
      recentTransactions: [],
      budgets: [],
    }),
    'GET /reports/trend': ok({
      from: '2026-09-01',
      to: '2026-09-30',
      groupBy: 'week',
      currency: 'USD',
      buckets: [],
    }),
    'GET /reports/category-breakdown': ok({
      from: '2026-09-01',
      to: '2026-09-30',
      type: 'expense',
      currency: 'USD',
      totalMinor: 0,
      items: [],
      other: null,
    }),
    'GET /recurring-templates': ok({ items: [] }),
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));
  resetFixtureIds();
  setViewport(VIEWPORT.desktop);
  signedInAs('user');
});
afterEach(() => vi.useRealTimers());

describe('dashboard date range', () => {
  it('sends the range from the URL to the summary, trend and category widgets', async () => {
    const mock = api();
    await renderApp('/dashboard?from=2026-09-01&to=2026-09-30');
    await screen.findByTestId('hero-balance');
    await waitFor(() => {
      expect(mock.callsTo('GET /reports/trend').length).toBeGreaterThan(0);
      expect(mock.callsTo('GET /reports/category-breakdown').length).toBeGreaterThan(0);
    });
    for (const route of [
      'GET /reports/summary',
      'GET /reports/trend',
      'GET /reports/category-breakdown',
    ]) {
      const call = mock.callsTo(route as Key)[0]!;
      expect(call.params.get('from'), route).toBe('2026-09-01');
      expect(call.params.get('to'), route).toBe('2026-09-30');
    }
  });

  it('applies a preset to every widget and writes it to the URL', async () => {
    const mock = api();
    const user = userEvent.setup();
    const { router } = await renderApp('/dashboard');
    await screen.findByTestId('hero-balance');
    await user.selectOptions(screen.getByLabelText('Range'), 'last-30');
    await waitFor(() => expect(router.state.location.search).toEqual({ range: 'last-30' }));
    await waitFor(() => {
      for (const route of [
        'GET /reports/summary',
        'GET /reports/trend',
        'GET /reports/category-breakdown',
      ]) {
        const last = mock.callsTo(route as Key).at(-1)!;
        expect(last.params.get('from'), route).toBe('2026-09-17');
        expect(last.params.get('to'), route).toBe('2026-10-16');
      }
    });
  });
});

describe('dashboard on a phone viewport', () => {
  it('renders the same widgets in one column with the chart table alternative available', async () => {
    api();
    setViewport(VIEWPORT.mobile);
    const user = userEvent.setup();
    const { container } = await renderApp('/dashboard');
    await screen.findByTestId('hero-balance');
    await screen.findByTestId('trend-chart');
    expect(screen.getAllByRole('radio', { name: 'Table' }).length).toBeGreaterThan(0);
    await user.click(screen.getAllByRole('radio', { name: 'Table' })[0]!);
    expect(screen.getAllByRole('table').length).toBeGreaterThan(0);
    const { axe } = await import('vitest-axe');
    expect(await axe(container)).toHaveNoViolations();
  });
});

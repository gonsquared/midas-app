import type { ReportTrend } from '@midas/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { TrendChart } from './trend-chart';

function trend(overrides: Partial<ReportTrend> = {}): ReportTrend {
  return {
    from: '2026-10-01',
    to: '2026-10-31',
    groupBy: 'week',
    currency: 'USD',
    buckets: [
      {
        periodStart: '2026-10-05',
        periodEnd: '2026-10-11',
        incomeMinor: 105000,
        expenseMinor: 81240,
        netMinor: 23760,
      },
      {
        periodStart: '2026-10-12',
        periodEnd: '2026-10-18',
        incomeMinor: 0,
        expenseMinor: 30000,
        netMinor: -30000,
      },
    ],
    ...overrides,
  };
}

describe('TrendChart', () => {
  it('renders the Recharts plot as SVG and describes it for assistive technology', async () => {
    const { container } = render(
      <TrendChart trend={trend()} title="Income and expenses by week" />,
    );
    const group = screen.getByRole('group', { name: /Income and expenses by week/ });
    expect(group).toHaveAttribute('aria-roledescription', 'chart');
    expect(group).toHaveAccessibleName(
      /Total income \$1,050.00, expenses \$1,112.40, net −\$62.40/,
    );
    await screen.findByTestId('trend-chart');
    await expectSvg(container);
    // Columns for the non-zero values (zero-height columns draw nothing), plus the net line.
    expect(container.querySelectorAll('.recharts-bar-rectangle').length).toBe(3);
    expect(container.querySelector('.recharts-line-curve')).not.toBeNull();
  });

  it('moves a persistent readout with the arrow keys', async () => {
    const user = userEvent.setup();
    render(<TrendChart trend={trend()} title="Income and expenses by week" />);
    const group = screen.getByRole('group', { name: /Income and expenses by week/ });
    group.focus();
    await user.keyboard('{ArrowRight}');
    expect(group).toHaveAccessibleDescription(
      'Week of Oct 5. Income $1,050.00. Expenses $812.40. Net +$237.60.',
    );
    await user.keyboard('{ArrowRight}');
    expect(group).toHaveAccessibleDescription(
      'Week of Oct 12. Income $0.00. Expenses $300.00. Net −$300.00.',
    );
    await user.keyboard('{Escape}');
    expect(group).toHaveAccessibleDescription(/Use the left and right arrow keys/);
  });

  it('announces readout changes only for keyboard moves', async () => {
    const user = userEvent.setup();
    render(<TrendChart trend={trend()} title="Income and expenses by week" />);
    const group = screen.getByRole('group', { name: /Income and expenses by week/ });
    const live = () => document.getElementById(group.getAttribute('aria-describedby') ?? '');
    expect(live()).toHaveAttribute('aria-live', 'off');
    group.focus();
    await user.keyboard('{ArrowRight}');
    expect(live()).toHaveAttribute('aria-live', 'polite');
    await user.tab();
    expect(live()).toHaveAttribute('aria-live', 'off');
  });

  it('offers the same numbers as a real table', async () => {
    const user = userEvent.setup();
    render(<TrendChart trend={trend()} title="Income and expenses by week" />);
    await user.click(screen.getByRole('radio', { name: 'Table' }));
    const table = screen.getByRole('table', { name: /Income and expenses by week, USD/ });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Period', 'Income', 'Expenses', 'Net']);
    const rows = within(table).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Week of Oct 5$1,050.00$812.40+$237.60');
    expect(rows[2]).toHaveTextContent('−$300.00');
  });

  it('says so when there is no activity instead of drawing an empty chart', () => {
    const empty = trend({
      buckets: [
        {
          periodStart: '2026-10-01',
          periodEnd: '2026-10-07',
          incomeMinor: 0,
          expenseMinor: 0,
          netMinor: 0,
        },
      ],
    });
    render(<TrendChart trend={empty} title="Income and expenses by week" />);
    expect(screen.getByText('No income or expenses in this range.')).toBeVisible();
    expect(screen.queryByRole('group', { name: /Income and expenses/ })).not.toBeInTheDocument();
  });

  it('adds no style element to the document or the chart (strict CSP)', async () => {
    const before = document.head.querySelectorAll('style').length;
    const { container } = render(
      <TrendChart trend={trend()} title="Income and expenses by week" />,
    );
    await expectSvg(container);
    expect(document.head.querySelectorAll('style')).toHaveLength(before);
    expect(container.querySelectorAll('style')).toHaveLength(0);
    expect(container.innerHTML).not.toMatch(/<style/);
  });

  it('has no axe violations in chart and table views', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <TrendChart trend={trend()} title="Income and expenses by week" />,
    );
    await expectSvg(container);
    expect(await axe(container)).toHaveNoViolations();
    await user.click(screen.getByRole('radio', { name: 'Table' }));
    expect(await axe(container)).toHaveNoViolations();
  });
});

async function expectSvg(container: HTMLElement) {
  const { waitFor } = await import('@testing-library/react');
  await waitFor(() => expect(container.querySelector('svg.recharts-surface')).not.toBeNull(), {
    timeout: 15_000,
  });
}

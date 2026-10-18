import type { ReportTrend } from '@midas/shared';
import { lazy, Suspense, useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Amount } from '@/components/domain/amount';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';
import { formatMinor } from '@/lib/money';
import { usePreferences } from '@/lib/preferences';
import { useContainerWidth } from '@/lib/use-container-width';
import { groupWord, isEmptyTrend, periodLabel, trendTotals } from './trend-format';

const TrendPlot = lazy(() => import('./trend-plot'));

const VIEW_OPTIONS = [
  { value: 'chart', label: 'Chart' },
  { value: 'table', label: 'Table' },
] as const;

const FALLBACK_WIDTH = 640;

function Swatch({ className }: { className: string }) {
  return <span aria-hidden="true" className={cn('inline-block size-3 rounded-sm', className)} />;
}

function Legend() {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-body-sm text-ink-2">
      <li className="flex items-center gap-1.5">
        <Swatch className="bg-series-income" />
        Income
      </li>
      <li className="flex items-center gap-1.5">
        <Swatch className="bg-series-expense" />
        Expenses
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="inline-block h-0.5 w-4 bg-series-net" />
        Net
      </li>
    </ul>
  );
}

export function TrendTable({ trend }: { trend: ReportTrend }) {
  const { locale } = usePreferences();
  return (
    <div className="max-h-96 overflow-auto">
      <table className="w-full border-collapse text-body-sm">
        <caption className="sr-only">
          Income and expenses by {groupWord(trend.groupBy)}, {trend.currency}
        </caption>
        <thead className="sticky top-0 bg-surface">
          <tr className="border-b border-line text-left text-ink-2">
            <th scope="col" className="py-2 pr-3 font-medium">
              Period
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">
              Income
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">
              Expenses
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Net
            </th>
          </tr>
        </thead>
        <tbody>
          {trend.buckets.map((bucket) => (
            <tr key={bucket.periodStart} className="border-b border-line last:border-b-0">
              <th scope="row" className="py-2 pr-3 text-left font-normal">
                {periodLabel(bucket, trend.groupBy, locale)}
              </th>
              <td className="py-2 pr-3 text-right">
                <Amount minor={bucket.incomeMinor} currency={trend.currency} />
              </td>
              <td className="py-2 pr-3 text-right">
                <Amount minor={bucket.expenseMinor} currency={trend.currency} />
              </td>
              <td className="py-2 text-right">
                <Amount
                  minor={bucket.netMinor}
                  currency={trend.currency}
                  sign="always"
                  tone={bucket.netMinor > 0 ? 'income' : 'ink'}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface TrendChartProps {
  trend: ReportTrend;
  title: string;
  /** A link or button shown when the range has no activity, to widen the range. */
  emptyAction?: ReactNode;
}

/**
 * Income and expenses over time with a Chart | Table switch (ui-design 8, E7-F2-S3). The chart is
 * keyboard operable: arrow keys move between periods and update a persistent readout that is also
 * a polite live region; the table carries the same numbers.
 */
export function TrendChart({ trend, title, emptyAction }: TrendChartProps) {
  const { locale } = usePreferences();
  const readoutId = useId();
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [active, setActive] = useState<number | null>(null);
  // Only keyboard moves are announced; pointer hover would flood the live region.
  const [announce, setAnnounce] = useState(false);
  const [containerRef, measured] = useContainerWidth<HTMLDivElement>();
  const width = measured > 0 ? measured : FALLBACK_WIDTH;
  const height = width < 480 ? 180 : 280;
  const totals = trendTotals(trend.buckets);
  const empty = isEmptyTrend(trend.buckets);
  const money = (minor: number, sign: 'auto' | 'always' = 'auto') =>
    formatMinor(minor, trend.currency, locale, { sign });

  const summary = `Total income ${money(totals.incomeMinor)}, expenses ${money(
    totals.expenseMinor,
  )}, net ${money(totals.netMinor, 'always')}.`;
  const bucket = active !== null ? trend.buckets[active] : undefined;
  const hint = `Use the left and right arrow keys to read each ${groupWord(trend.groupBy)}.`;
  const readout = bucket
    ? `${periodLabel(bucket, trend.groupBy, locale)}. Income ${money(bucket.incomeMinor)}. Expenses ${money(
        bucket.expenseMinor,
      )}. Net ${money(bucket.netMinor, 'always')}.`
    : `${summary} ${hint}`;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = trend.buckets.length - 1;
    if (last < 0) return;
    setAnnounce(true);
    if (event.key === 'ArrowRight') setActive((i) => (i === null ? 0 : Math.min(i + 1, last)));
    else if (event.key === 'ArrowLeft') setActive((i) => (i === null ? last : Math.max(i - 1, 0)));
    else if (event.key === 'Home') setActive(0);
    else if (event.key === 'End') setActive(last);
    else if (event.key === 'Escape') setActive(null);
    else {
      setAnnounce(false);
      return;
    }
    event.preventDefault();
  };

  return (
    <div ref={containerRef} data-testid="trend-chart">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-heading">{title}</h2>
        <Segmented legend="Trend view" options={VIEW_OPTIONS} value={view} onChange={setView} />
      </div>
      {view === 'table' ? (
        <TrendTable trend={trend} />
      ) : (
        <div className="flex flex-col gap-2">
          <Legend />
          {empty ? (
            <div className="flex flex-col items-start gap-2 border-b border-axis py-6">
              <p className="text-body text-ink-2">No income or expenses in this range.</p>
              {emptyAction}
            </div>
          ) : (
            <div
              tabIndex={0}
              role="group"
              aria-roledescription="chart"
              aria-label={`Income and expenses by ${groupWord(trend.groupBy)}. ${summary}`}
              aria-describedby={readoutId}
              onKeyDown={onKeyDown}
              onBlur={() => {
                setAnnounce(false);
                setActive(null);
              }}
              className="rounded-sm"
            >
              <div aria-hidden="true">
                <Suspense fallback={<Skeleton className="h-[280px]" />}>
                  <TrendPlot
                    trend={trend}
                    locale={locale}
                    width={width}
                    height={height}
                    active={active}
                    onActive={(index) => {
                      setAnnounce(false);
                      setActive(index);
                    }}
                  />
                </Suspense>
              </div>
            </div>
          )}
          <p
            id={readoutId}
            aria-live={announce ? 'polite' : 'off'}
            className="tabular min-h-10 text-body-sm text-ink-2"
          >
            {empty ? '' : readout}
          </p>
        </div>
      )}
    </div>
  );
}

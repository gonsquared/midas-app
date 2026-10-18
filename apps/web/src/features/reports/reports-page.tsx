import type { ReportSummary, TrendGroupBy } from '@midas/shared';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useMemo, type ReactNode } from 'react';
import { Amount } from '@/components/domain/amount';
import { PageHeader } from '@/components/page-header';
import { Alert } from '@/components/ui/alert';
import { ApiErrorAlert } from '@/components/ui/api-error-alert';
import { Button } from '@/components/ui/button';
import { FieldFrame, NativeSelect } from '@/components/ui/form-field';
import { Skeleton } from '@/components/ui/skeleton';
import { chooseCurrency } from '@/features/dashboard/search';
import { ExportButton } from '@/features/transactions/export-button';
import { ApiError } from '@/lib/api-client';
import { todayLocalDate, type DateRange } from '@/lib/dates';
import { usePreferences } from '@/lib/preferences';
import { useCategoryBreakdown, useReportSummary, useReportTrend } from './api';
import { CategoryBreakdown } from './category-breakdown';
import { rangeToSearch, resolveRange } from './range';
import { RangeSelector } from './range-selector';
import {
  keptSentence,
  parseReportsSearch,
  suggestGrouping,
  toCategoryType,
  type ReportsSearch,
} from './search';
import { TrendChart } from './trend-chart';

const GROUP_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

const panel = 'rounded-md border border-line bg-surface p-4 sm:p-5';

function Equation({ totals }: { totals: ReportSummary['totalsByCurrency'][number] }) {
  const kept = keptSentence(totals.incomeMinor, totals.netMinor);
  return (
    <section
      aria-label="Summary"
      className={`${panel} flex flex-wrap items-baseline justify-between gap-3`}
    >
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span>
          Income{' '}
          <Amount minor={totals.incomeMinor} currency={totals.currency} className="font-semibold" />
        </span>
        <span aria-hidden="true">&minus;</span>
        <span>
          Expenses{' '}
          <Amount
            minor={totals.expenseMinor}
            currency={totals.currency}
            className="font-semibold"
          />
        </span>
        <span aria-hidden="true">=</span>
        <span>
          Net{' '}
          <Amount
            minor={totals.netMinor}
            currency={totals.currency}
            sign="always"
            tone={totals.netMinor > 0 ? 'income' : 'ink'}
            className="font-semibold"
          />
        </span>
      </p>
      {kept ? <p className="text-body-sm text-ink-2">{kept}</p> : null}
    </section>
  );
}

export function ReportsPage() {
  const raw = useSearch({ strict: false }) as Record<string, unknown>;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const search = useMemo(() => parseReportsSearch(raw), [JSON.stringify(raw)]);
  const { locale, timezone, currency: preferred } = usePreferences();
  const today = todayLocalDate(timezone);
  const { range, kind } = resolveRange(search, today);
  const navigate = useNavigate();
  const type = toCategoryType(search);

  const summary = useReportSummary(range);
  const totalsList = useMemo(() => summary.data?.totalsByCurrency ?? [], [summary.data]);
  const codes = totalsList.map((t) => t.currency);
  const currency = chooseCurrency(search.currency, codes, preferred);
  const trend = useReportTrend({ range, currency, groupBy: search.group });
  const breakdown = useCategoryBreakdown({ range, currency, type });

  const go = (patch: Partial<ReportsSearch>, rangeOverride?: DateRange) => {
    const next: ReportsSearch = {
      ...rangeToSearch(rangeOverride ?? range, today),
      ...(search.currency ? { currency: search.currency } : {}),
      ...(search.group ? { group: search.group } : {}),
      ...(search.type ? { type: search.type } : {}),
      ...patch,
    };
    for (const key of Object.keys(next) as Array<keyof ReportsSearch>) {
      if (next[key] === undefined) delete next[key];
    }
    void navigate({ to: '/reports', search: next, replace: true });
  };
  const widen = (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => go({}, { from: `${today.slice(0, 4)}-01-01`, to: today })}
    >
      Show this year
    </Button>
  );

  const tooLarge = trend.error instanceof ApiError && trend.error.code === 'RANGE_TOO_LARGE';
  let trendBody: ReactNode;
  if (trend.data) {
    trendBody = (
      <TrendChart
        trend={trend.data}
        title={`Income and expenses by ${trend.data.groupBy}`}
        emptyAction={widen}
      />
    );
  } else if (tooLarge) {
    const suggested = suggestGrouping(search.group);
    trendBody = (
      <Alert
        variant="warning"
        title="That is too many periods to chart."
        action={
          <Button variant="secondary" size="sm" onClick={() => go({ group: suggested })}>
            Group by {suggested}
          </Button>
        }
      >
        Choose a shorter range or a coarser grouping.
      </Alert>
    );
  } else if (trend.isError) {
    trendBody = (
      <ApiErrorAlert
        error={trend.error}
        message="Couldn't load the chart."
        action={
          <Button variant="secondary" size="sm" onClick={() => void trend.refetch()}>
            Try again
          </Button>
        }
      />
    );
  } else {
    trendBody = <Skeleton className="h-72" />;
  }

  const totals = totalsList.find((t) => t.currency === currency);
  let body: ReactNode;
  if (summary.isPending) {
    body = <Skeleton className="h-72" />;
  } else if (!summary.data) {
    body = (
      <ApiErrorAlert
        error={summary.error}
        message="Couldn't load your reports. Check your connection and try again."
        action={
          <Button variant="secondary" size="sm" onClick={() => void summary.refetch()}>
            Try again
          </Button>
        }
      />
    );
  } else if (summary.data.wallets.length === 0) {
    body = (
      <p className={panel}>
        Reports need at least one wallet. Create a wallet and add transactions.
      </p>
    );
  } else {
    body = (
      <div className="flex flex-col gap-4">
        {totals ? <Equation totals={totals} /> : null}
        <section aria-label="Income and expenses" className={panel}>
          {trendBody}
        </section>
        <section aria-label="Where it went" className={panel}>
          {breakdown.data ? (
            <CategoryBreakdown
              data={breakdown.data}
              type={type}
              onTypeChange={(next) => go({ type: next === 'income' ? 'income' : undefined })}
              emptyAction={widen}
            />
          ) : breakdown.isError ? (
            <ApiErrorAlert error={breakdown.error} message="Couldn't load the breakdown." />
          ) : (
            <Skeleton className="h-56" />
          )}
        </section>
        <section
          aria-label="Export"
          className={`${panel} flex flex-wrap items-center justify-between gap-3`}
        >
          <p className="text-body-sm text-ink-2">Want the raw rows? Download this range as CSV.</p>
          <ExportButton
            label="Export transactions for this range"
            filters={{
              from: range.from,
              to: range.to,
              wallet: [],
              category: [],
              type: [],
              sort: 'date_desc',
            }}
          />
        </section>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Reports" />
      <div className="mb-6 flex flex-wrap items-end gap-x-6 gap-y-3">
        <RangeSelector
          range={range}
          kind={kind}
          locale={locale}
          today={today}
          onChange={(next) => go({}, next)}
        />
        {totalsList.length > 1 ? (
          <FieldFrame label="Currency" id="report-currency">
            {(control) => (
              <NativeSelect
                {...control}
                value={currency ?? ''}
                onChange={(next) => go({ currency: next })}
                options={codes.map((code) => ({ value: code, label: code }))}
              />
            )}
          </FieldFrame>
        ) : null}
        <FieldFrame label="Group by" id="report-group">
          {(control) => (
            <NativeSelect
              {...control}
              value={search.group ?? 'auto'}
              onChange={(next) =>
                go({ group: next === 'auto' ? undefined : (next as TrendGroupBy) })
              }
              options={GROUP_OPTIONS}
            />
          )}
        </FieldFrame>
      </div>
      {body}
    </div>
  );
}

import type { CategoryType } from '@midas/shared';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PageHeader } from '@/components/page-header';
import { useAnnounce } from '@/components/ui/announcer';
import { ApiErrorAlert } from '@/components/ui/api-error-alert';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { attentionAnnouncement } from '@/features/budgets/budget-state';
import { useRecurringTemplates } from '@/features/recurring/api';
import { useCategoryBreakdown, useReportSummary, useReportTrend } from '@/features/reports/api';
import { rangeToSearch, resolveRange } from '@/features/reports/range';
import { RangeSelector } from '@/features/reports/range-selector';
import { todayLocalDate, type DateRange } from '@/lib/dates';
import { usePreferences } from '@/lib/preferences';
import { panelClass } from './budgets-panel';
import { DashboardContent } from './dashboard-content';
import { chooseCurrency, parseDashboardSearch, type DashboardSearch } from './search';

function DashboardSkeleton() {
  return (
    <div aria-busy="true" className="grid gap-4 xl:grid-cols-3">
      <Skeleton className="h-56 xl:col-span-2" />
      <Skeleton className="h-56" />
      <Skeleton className="h-80 xl:col-span-2" />
      <Skeleton className="h-80" />
    </div>
  );
}

function FirstRun() {
  return (
    <section aria-labelledby="welcome-heading" className={panelClass}>
      <h2 id="welcome-heading" className="font-display text-heading">
        Welcome. Create a wallet to get your numbers moving.
      </h2>
      <p className="mt-1 mb-3 max-w-[70ch] text-body text-ink-2">
        A wallet is where your money lives. Add one, then record your first expense and set a
        monthly budget.
      </p>
      <Button asChild>
        <Link to="/wallets/new">Create a wallet</Link>
      </Button>
    </section>
  );
}

export function DashboardPage() {
  const raw = useSearch({ strict: false }) as Record<string, unknown>;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const search = useMemo(() => parseDashboardSearch(raw), [JSON.stringify(raw)]);
  const { locale, timezone, currency: preferred } = usePreferences();
  const today = todayLocalDate(timezone);
  const { range, kind } = resolveRange(search, today);
  const navigate = useNavigate();
  const announce = useAnnounce();
  const [type, setType] = useState<CategoryType>('expense');

  const summary = useReportSummary(range);
  const totalsList = useMemo(() => summary.data?.totalsByCurrency ?? [], [summary.data]);
  const codes = totalsList.map((t) => t.currency);
  const currency = chooseCurrency(search.currency, codes, preferred);
  const trend = useReportTrend({ range, currency });
  const breakdown = useCategoryBreakdown({ range, currency, type });
  const recurring = useRecurringTemplates();

  const announced = useRef('');
  useEffect(() => {
    if (!summary.data) return;
    const flagged = summary.data.budgets.filter((b) => !currency || b.currency === currency);
    const message = attentionAnnouncement(flagged);
    if (message && message !== announced.current) announce(message);
    announced.current = message;
  }, [summary.data, currency, announce]);

  const go = (next: DashboardSearch) =>
    void navigate({ to: '/dashboard', search: next, replace: true });
  const keepCurrency = search.currency ? { currency: search.currency } : {};
  const changeRange = (next: DateRange) => go({ ...rangeToSearch(next, today), ...keepCurrency });

  let body: ReactNode;
  if (summary.isPending) {
    body = <DashboardSkeleton />;
  } else if (!summary.data) {
    body = (
      <ApiErrorAlert
        error={summary.error}
        message="Couldn't load your dashboard. Check your connection and try again."
        action={
          <Button variant="secondary" size="sm" onClick={() => void summary.refetch()}>
            Try again
          </Button>
        }
      />
    );
  } else if (summary.data.wallets.length === 0) {
    body = <FirstRun />;
  } else {
    body = (
      <DashboardContent
        summary={summary.data}
        fetching={summary.isFetching}
        totals={totalsList.find((t) => t.currency === currency)}
        currency={currency}
        range={range}
        today={today}
        trend={trend}
        breakdown={breakdown}
        type={type}
        onTypeChange={setType}
        templates={recurring.data ?? []}
        onWiden={() => changeRange({ from: `${today.slice(0, 4)}-01-01`, to: today })}
      />
    );
  }

  return (
    <div>
      <PageHeader title="Dashboard" />
      <div className="mb-6 flex flex-wrap items-end gap-x-6 gap-y-3">
        <RangeSelector
          range={range}
          kind={kind}
          locale={locale}
          today={today}
          onChange={changeRange}
        />
        {totalsList.length > 1 ? (
          <Segmented
            legend="Currency"
            legendHidden={false}
            options={codes.map((code) => ({ value: code, label: code }))}
            value={currency ?? null}
            onChange={(next) => go({ ...rangeToSearch(range, today), currency: next })}
          />
        ) : null}
      </div>
      {body}
    </div>
  );
}

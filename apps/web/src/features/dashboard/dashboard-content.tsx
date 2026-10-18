import type {
  CategoryType,
  CurrencyTotals,
  RecurringTemplate,
  ReportCategoryBreakdown,
  ReportSummary,
  ReportTrend,
} from '@midas/shared';
import type { UseQueryResult } from '@tanstack/react-query';
import { ApiErrorAlert } from '@/components/ui/api-error-alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CategoryBreakdown } from '@/features/reports/category-breakdown';
import { TrendChart } from '@/features/reports/trend-chart';
import type { DateRange } from '@/lib/dates';
import { BudgetsPanel, panelClass } from './budgets-panel';
import { ComingUp } from './coming-up';
import { AttentionStrip, PositionPanel, WalletsPanel } from './position';
import { RecentActivity } from './recent-activity';

export interface DashboardContentProps {
  summary: ReportSummary;
  fetching: boolean;
  totals: CurrencyTotals | undefined;
  currency: string | undefined;
  range: DateRange;
  today: string;
  trend: UseQueryResult<ReportTrend>;
  breakdown: UseQueryResult<ReportCategoryBreakdown>;
  type: CategoryType;
  onTypeChange: (type: CategoryType) => void;
  templates: readonly RecurringTemplate[];
  onWiden: () => void;
}

function Retry({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="secondary" size="sm" onClick={onClick}>
      Try again
    </Button>
  );
}

export function DashboardContent(props: DashboardContentProps) {
  const { summary, totals, currency, range, today, trend, breakdown, type } = props;
  const budgets = summary.budgets.filter((b) => !currency || b.currency === currency);
  const widen = (
    <Button variant="secondary" size="sm" onClick={props.onWiden}>
      Show this year
    </Button>
  );
  return (
    <div aria-busy={props.fetching || undefined} className="flex flex-col gap-4">
      <AttentionStrip budgets={budgets} />
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          {totals ? (
            <PositionPanel
              totals={totals}
              walletCount={summary.wallets.filter((w) => w.currency === totals.currency).length}
              range={range}
              today={today}
            />
          ) : null}
        </div>
        <WalletsPanel wallets={summary.wallets} />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <section aria-label="Income and expenses" className={`${panelClass} xl:col-span-2`}>
          {trend.data ? (
            <TrendChart
              trend={trend.data}
              title={`Income and expenses by ${trend.data.groupBy}`}
              emptyAction={widen}
            />
          ) : trend.isError ? (
            <ApiErrorAlert
              error={trend.error}
              message="Couldn't load the chart."
              action={<Retry onClick={() => void trend.refetch()} />}
            />
          ) : (
            <Skeleton className="h-72" />
          )}
        </section>
        <BudgetsPanel budgets={budgets} today={today} limit={4} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <section aria-label="Where it went" className={panelClass}>
          {breakdown.data ? (
            <CategoryBreakdown
              data={breakdown.data}
              type={type}
              onTypeChange={props.onTypeChange}
              emptyAction={widen}
            />
          ) : breakdown.isError ? (
            <ApiErrorAlert
              error={breakdown.error}
              message="Couldn't load the breakdown."
              action={<Retry onClick={() => void breakdown.refetch()} />}
            />
          ) : (
            <Skeleton className="h-72" />
          )}
        </section>
        <RecentActivity transactions={summary.recentTransactions} today={today} />
      </div>
      <ComingUp templates={props.templates} today={today} />
    </div>
  );
}

import type { Budget } from '@midas/shared';
import { Link } from '@tanstack/react-router';
import { BudgetMeter, BudgetStateBadge } from '@/components/domain/budget-meter';
import { budgetName, paceOf, topBudgets } from '@/features/budgets/budget-state';
import { formatMinor } from '@/lib/money';
import { usePreferences } from '@/lib/preferences';

export const panelClass = 'rounded-md border border-line bg-surface p-4 sm:p-5';
export const panelLinkClass = 'text-body-sm font-medium text-primary underline underline-offset-2';

export function BudgetsPanel({
  budgets,
  today,
  limit,
}: {
  budgets: readonly Budget[];
  today: string;
  limit: number;
}) {
  const { locale } = usePreferences();
  const shown = topBudgets(budgets, limit);
  return (
    <section aria-labelledby="budgets-heading" className={panelClass}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 id="budgets-heading" className="font-display text-heading">
          Budgets
        </h2>
        <Link to="/budgets" className={panelLinkClass}>
          Manage
        </Link>
      </div>
      {shown.length === 0 ? (
        <p className="text-body-sm text-ink-2">
          No budgets for this period yet.{' '}
          <Link to="/budgets" className={panelLinkClass}>
            Set a budget
          </Link>
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-4 p-0">
          {shown.map((budget) => {
            const name = budgetName(budget);
            const status = budget.status;
            return (
              <li key={budget.id} data-testid="dashboard-budget" className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-medium" dir="auto">
                    {name}
                  </span>
                  <BudgetStateBadge budget={budget} />
                </div>
                <BudgetMeter
                  budget={budget}
                  pace={paceOf(status, today)}
                  label={`${name} budget`}
                />
                {status ? (
                  <p className="tabular text-caption text-ink-3">
                    {formatMinor(status.spentMinor, budget.currency, locale)} of{' '}
                    {formatMinor(budget.amountMinor, budget.currency, locale)}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

import type { Transaction } from '@midas/shared';
import { Link } from '@tanstack/react-router';
import { ArrowLeftRight } from 'lucide-react';
import { Amount } from '@/components/domain/amount';
import { CategoryChip } from '@/components/domain/category-chip';
import { groupByDay } from '@/features/transactions/filters';
import { describeTransaction, signedAmount } from '@/features/transactions/transaction-row';
import { formatDayHeading } from '@/lib/dates';
import { usePreferences } from '@/lib/preferences';
import { panelClass, panelLinkClass } from './budgets-panel';

export function RecentActivity({
  transactions,
  today,
}: {
  transactions: readonly Transaction[];
  today: string;
}) {
  const { locale } = usePreferences();
  return (
    <section aria-labelledby="recent-heading" className={panelClass}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 id="recent-heading" className="font-display text-heading">
          Recent activity
        </h2>
        <Link to="/transactions" className={panelLinkClass}>
          All activity
        </Link>
      </div>
      {transactions.length === 0 ? (
        <p className="text-body-sm text-ink-2">No transactions in this range.</p>
      ) : (
        groupByDay(transactions).map((group) => (
          <div key={group.date}>
            <h3 className="mt-2 text-caption font-semibold text-ink-3">
              {formatDayHeading(group.date, locale, today)}
            </h3>
            <ul className="m-0 list-none p-0">
              {group.items.map((transaction) => (
                <li key={transaction.id}>
                  <Link
                    to="/transactions"
                    search={{ tx: transaction.id }}
                    className="flex min-h-11 items-center justify-between gap-3 rounded-sm px-1 hover:bg-sunken"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {transaction.category ? (
                        <CategoryChip
                          icon={transaction.category.icon}
                          color={transaction.category.color}
                          size="sm"
                        />
                      ) : (
                        <ArrowLeftRight aria-hidden="true" className="size-4 text-ink-2" />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-body-sm" dir="auto">
                          {describeTransaction(transaction)}
                        </span>
                        <span className="block truncate text-caption text-ink-3">
                          {transaction.wallet.name}
                        </span>
                      </span>
                    </span>
                    <Amount
                      minor={signedAmount(transaction)}
                      currency={transaction.currency}
                      sign="always"
                      tone={transaction.type === 'income' ? 'income' : 'ink'}
                      className="text-body-sm"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}

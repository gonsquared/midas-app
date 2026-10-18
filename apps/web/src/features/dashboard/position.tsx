import type { Budget, CurrencyTotals, Wallet } from '@midas/shared';
import { Link } from '@tanstack/react-router';
import { TriangleAlert } from 'lucide-react';
import { Amount } from '@/components/domain/amount';
import { WalletBalance } from '@/components/domain/wallet-balance';
import { WalletTypeIcon } from '@/components/domain/wallet-type-icon';
import { attentionSentence, needsAttention } from '@/features/budgets/budget-state';
import { daysBetween, rangeLengthDays, type DateRange } from '@/lib/dates';
import { formatMinor } from '@/lib/money';
import { usePreferences } from '@/lib/preferences';

/** Budgets that are exceeded or near their limit, as a tinted band (ui-design 6.3, 6.9). */
export function AttentionStrip({ budgets }: { budgets: readonly Budget[] }) {
  const { locale } = usePreferences();
  const flagged = budgets.filter(needsAttention);
  if (flagged.length === 0) return null;
  return (
    <section
      aria-labelledby="attention-heading"
      className="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-md border-l-4 border-warning bg-warning-tint p-3"
    >
      <div className="flex items-start gap-3">
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning" />
        <div>
          <h2 id="attention-heading" className="text-body-sm font-semibold text-ink">
            Needs attention
          </h2>
          <ul className="m-0 list-none p-0 text-body-sm text-ink-2">
            {flagged.map((budget) => (
              <li key={budget.id}>{attentionSentence(budget, locale)}</li>
            ))}
          </ul>
        </div>
      </div>
      <Link
        to="/budgets"
        className="text-body-sm font-medium text-primary underline underline-offset-2"
      >
        View budgets
      </Link>
    </section>
  );
}

/** Slim track of days elapsed in the range with the brass today notch (hidden for past ranges). */
function PeriodStrip({ range, today }: { range: DateRange; today: string }) {
  if (today < range.from || today > range.to) return null;
  const total = rangeLengthDays(range);
  const day = daysBetween(range.from, today) + 1;
  const fraction = (day / total) * 100;
  return (
    <div className="mt-3">
      <svg
        role="img"
        aria-label={`Day ${day} of ${total}`}
        width="100%"
        height="16"
        className="block"
      >
        <rect y="4" width="100%" height="8" rx="4" className="fill-sunken" />
        <rect y="4" width={`${fraction}%`} height="8" rx="4" className="fill-line-strong/40" />
        <rect x={`${fraction}%`} width="2" height="16" className="fill-brass" />
      </svg>
      <p className="mt-1 text-caption text-ink-3">
        Day {day} of {total}
      </p>
    </div>
  );
}

export interface PositionProps {
  totals: CurrencyTotals;
  walletCount: number;
  range: DateRange;
  today: string;
}

/** Total balance, the income minus expenses equation, and how far into the period we are. */
export function PositionPanel({ totals, walletCount, range, today }: PositionProps) {
  const { locale } = usePreferences();
  const money = (minor: number, sign: 'auto' | 'always' = 'auto') =>
    formatMinor(minor, totals.currency, locale, { sign });
  return (
    <section
      aria-labelledby="position-heading"
      className="rounded-md border border-line bg-surface p-4 sm:p-5"
    >
      <h2 id="position-heading" className="text-body-sm font-medium text-ink-2">
        Total balance{range.to !== today ? ' (as of today)' : ''}
      </h2>
      <p
        className="font-display text-figure-lg font-semibold sm:text-figure-hero"
        data-testid="hero-balance"
      >
        <Amount minor={totals.balanceMinor} currency={totals.currency} />
      </p>
      <p className="text-body-sm text-ink-3">
        across {walletCount} {walletCount === 1 ? 'wallet' : 'wallets'}
      </p>
      <dl
        className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1"
        aria-label={`Income ${money(totals.incomeMinor)} minus expenses ${money(
          totals.expenseMinor,
        )} equals net ${money(totals.netMinor, 'always')}`}
      >
        <div>
          <dt className="text-caption text-ink-3">Income</dt>
          <dd className="font-medium">
            <Amount minor={totals.incomeMinor} currency={totals.currency} />
          </dd>
        </div>
        <span aria-hidden="true" className="text-ink-3">
          &minus;
        </span>
        <div>
          <dt className="text-caption text-ink-3">Expenses</dt>
          <dd className="font-medium">
            <Amount minor={totals.expenseMinor} currency={totals.currency} />
          </dd>
        </div>
        <span aria-hidden="true" className="text-ink-3">
          =
        </span>
        <div>
          <dt className="text-caption text-ink-3">Net</dt>
          <dd className="font-semibold">
            <Amount
              minor={totals.netMinor}
              currency={totals.currency}
              sign="always"
              tone={totals.netMinor > 0 ? 'income' : 'ink'}
            />
          </dd>
        </div>
      </dl>
      <PeriodStrip range={range} today={today} />
    </section>
  );
}

const WALLET_LIMIT = 5;

export function WalletsPanel({ wallets }: { wallets: readonly Wallet[] }) {
  const shown = wallets.slice(0, WALLET_LIMIT);
  return (
    <section
      aria-labelledby="wallets-heading"
      className="rounded-md border border-line bg-surface p-4 sm:p-5"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 id="wallets-heading" className="font-display text-heading">
          Wallets
        </h2>
        <Link
          to="/wallets"
          className="text-body-sm font-medium text-primary underline underline-offset-2"
        >
          All wallets
        </Link>
      </div>
      <ul className="m-0 list-none p-0">
        {shown.map((wallet) => (
          <li
            key={wallet.id}
            className="flex items-center justify-between gap-3 border-t border-line first:border-t-0"
          >
            <span className="flex min-w-0 items-center gap-2">
              <WalletTypeIcon type={wallet.type} className="size-4 shrink-0 text-ink-2" />
              <span className="truncate" dir="auto">
                {wallet.name}
              </span>
            </span>
            <WalletBalance wallet={wallet} />
          </li>
        ))}
      </ul>
      {wallets.length > WALLET_LIMIT ? (
        <p className="mt-1 text-caption text-ink-3">+{wallets.length - WALLET_LIMIT} more</p>
      ) : null}
    </section>
  );
}

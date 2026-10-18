import type { Transaction } from '@midas/shared';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { Link } from '@tanstack/react-router';
import { ArrowLeftRight, Lock, MoreHorizontal, Repeat } from 'lucide-react';
import type { ReactNode } from 'react';
import { menuContentClass, menuItemClass } from '@/app/shell/add-menu';
import { Amount } from '@/components/domain/amount';
import { CategoryChip } from '@/components/domain/category-chip';
import { IconButton } from '@/components/ui/icon-button';
import { cn } from '@/lib/cn';
import { formatLocalDate } from '@/lib/dates';
import { formatMinor } from '@/lib/money';
import { usePreferences } from '@/lib/preferences';
import { OVERLAY_HISTORY_STATE } from './composer-store';

/** Note, else category, else "Transfer to/from {wallet}" (ui-design 18.3.3). */
export function describeTransaction(transaction: Transaction): string {
  if (transaction.note) return transaction.note;
  if (transaction.category) return transaction.category.name;
  if (transaction.transfer) {
    const other = transaction.transfer.counterpartWallet.name;
    return transaction.transfer.direction === 'out'
      ? `Transfer to ${other}`
      : `Transfer from ${other}`;
  }
  return 'Transaction';
}

/** Signed minor units as shown in the ledger: expenses and outgoing legs are negative. */
export function signedAmount(transaction: Transaction): number {
  const negative =
    transaction.type === 'expense' ||
    (transaction.type === 'transfer' && transaction.transfer?.direction === 'out');
  return negative ? -transaction.amountMinor : transaction.amountMinor;
}

/** Spoken summary, for example "Expense, Groceries, Checking, 16 October, minus $54.20". */
export function speakTransaction(transaction: Transaction, locale: string): string {
  const typeLabel = transaction.type[0]!.toUpperCase() + transaction.type.slice(1);
  const signed = signedAmount(transaction);
  const magnitude = formatMinor(Math.abs(signed), transaction.currency, locale);
  return [
    transaction.note ? `${transaction.note}.` : undefined,
    typeLabel,
    transaction.category?.name,
    transaction.wallet.name,
    formatLocalDate(transaction.occurredOn, locale, { day: 'numeric', month: 'long' }),
    signed < 0 ? `minus ${magnitude}` : magnitude,
    transaction.recurringTemplateId ? 'Recurring' : undefined,
  ]
    .filter(Boolean)
    .join(', ');
}

/** Wraps case-insensitive matches of the search text in <mark>, as text nodes (no HTML parsing). */
export function Highlight({ text, query }: { text: string; query: string | undefined }): ReactNode {
  const needle = query?.trim().toLowerCase();
  if (!needle) return text;
  const parts: ReactNode[] = [];
  const lower = text.toLowerCase();
  let from = 0;
  let index = lower.indexOf(needle, from);
  while (index !== -1) {
    if (index > from) parts.push(text.slice(from, index));
    parts.push(
      <mark
        key={index}
        className="bg-transparent font-semibold text-ink underline decoration-primary decoration-2"
      >
        {text.slice(index, index + needle.length)}
      </mark>,
    );
    from = index + needle.length;
    index = lower.indexOf(needle, from);
  }
  parts.push(text.slice(from));
  return parts;
}

export interface RowActions {
  onEdit: (transaction: Transaction) => void;
  onDuplicate: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
}

function RowMenu({ transaction, actions }: { transaction: Transaction; actions: RowActions }) {
  const transfer = transaction.type === 'transfer';
  const noun = transfer ? ' transfer' : '';
  const archived = transaction.wallet.archived || transaction.transfer?.counterpartWallet.archived;
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger asChild>
        <IconButton
          label={`Actions for ${describeTransaction(transaction)}`}
          size="sm"
          className="relative z-[1] pointer-coarse:size-11"
          icon={<MoreHorizontal className="size-4" />}
        />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={6} className={`${menuContentClass} max-w-72`}>
          {archived ? null : (
            <Menu.Item className={menuItemClass} onSelect={() => actions.onEdit(transaction)}>
              Edit{noun}
            </Menu.Item>
          )}
          <Menu.Item className={menuItemClass} onSelect={() => actions.onDuplicate(transaction)}>
            Duplicate{noun}
          </Menu.Item>
          {archived ? (
            <Menu.Item
              aria-disabled="true"
              className={`${menuItemClass} h-auto min-h-9 py-1.5 text-ink-3`}
              onSelect={(event) => event.preventDefault()}
            >
              Edit and delete are unavailable while {transaction.wallet.name} is archived.
            </Menu.Item>
          ) : (
            <>
              <Menu.Separator className="my-1 h-px bg-line" />
              <Menu.Item
                className={`${menuItemClass} text-danger`}
                onSelect={() => actions.onDelete(transaction)}
              >
                Delete{noun}
              </Menu.Item>
            </>
          )}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

export function TransactionRow({
  transaction,
  query,
  showDate,
  highlighted,
  actions,
}: {
  transaction: Transaction;
  query: string | undefined;
  /** Amount sorts have no day groups, so each row carries its own date. */
  showDate: boolean;
  highlighted: boolean;
  actions: RowActions;
}) {
  const { locale } = usePreferences();
  const description = describeTransaction(transaction);
  const signed = signedAmount(transaction);
  const transfer = transaction.type === 'transfer';
  const tone = transaction.type === 'income' ? 'income' : transfer ? 'muted' : 'ink';
  const secondary = [
    transaction.category?.name ?? (transfer ? 'Transfer' : ''),
    transaction.wallet.name,
  ]
    .filter(Boolean)
    .join(' - ');
  return (
    <li
      data-tx-row={transaction.id}
      className={cn(
        'relative grid min-h-16 grid-cols-[2rem_minmax(0,1fr)_auto_2.5rem] items-center gap-x-3 border-t border-line px-1 py-1.5',
        '@min-[45rem]:min-h-14 @min-[45rem]:grid-cols-[2rem_minmax(12rem,1fr)_9rem_10rem_9.5rem_2.5rem]',
        'hover:bg-sunken/40 active:bg-sunken/70',
        highlighted && 'bg-primary-tint',
      )}
    >
      {transaction.category ? (
        <CategoryChip icon={transaction.category.icon} color={transaction.category.color} />
      ) : (
        <span
          aria-hidden="true"
          className="inline-flex size-8 items-center justify-center rounded-sm bg-sunken text-ink-2"
        >
          <ArrowLeftRight className="size-[18px]" />
        </span>
      )}
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1">
          <Link
            to="."
            search={
              ((prev: Record<string, unknown>) => ({
                ...prev,
                compose: undefined,
                tx: transaction.id,
              })) as never
            }
            data-tx-link={transaction.id}
            state={(() => OVERLAY_HISTORY_STATE) as never}
            className="min-w-0 truncate font-medium text-ink after:absolute after:inset-0 focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-focus-ring focus-visible:outline-none"
            dir="auto"
          >
            <span className="sr-only">{speakTransaction(transaction, locale)}. </span>
            <span aria-hidden="true">
              <Highlight text={description} query={transaction.note ? query : undefined} />
            </span>
          </Link>
          {transaction.recurringTemplateId ? (
            <Repeat aria-hidden="true" className="size-3.5 shrink-0 text-ink-3" />
          ) : null}
        </div>
        <p className="truncate text-caption text-ink-2 @min-[45rem]:hidden">
          {secondary}
          {showDate
            ? ` - ${formatLocalDate(transaction.occurredOn, locale, { day: 'numeric', month: 'short' })}`
            : ''}
        </p>
      </div>
      <p className="hidden truncate text-body-sm text-ink-2 @min-[45rem]:block">
        {transaction.wallet.archived ? (
          <span className="inline-flex items-center gap-1">
            <Lock aria-hidden="true" className="size-3" />
            {transaction.wallet.name} (Archived)
          </span>
        ) : (
          transaction.wallet.name
        )}
        {showDate ? (
          <span className="block text-caption">
            {formatLocalDate(transaction.occurredOn, locale, { day: 'numeric', month: 'short' })}
          </span>
        ) : null}
      </p>
      <p className="hidden truncate text-body-sm text-ink-2 @min-[45rem]:block">
        {transaction.category?.name ?? '-'}
      </p>
      <div className="text-right text-body-sm @min-[45rem]:text-body" aria-hidden="true">
        <Amount minor={signed} currency={transaction.currency} sign="always" tone={tone} />
      </div>
      <RowMenu transaction={transaction} actions={actions} />
    </li>
  );
}

export function TransactionRowsSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div aria-hidden="true" className="flex flex-col">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="h-14 animate-shimmer border-t border-line bg-sunken/40" />
      ))}
    </div>
  );
}

import type { Wallet } from '@midas/shared';
import { Link } from '@tanstack/react-router';
import { Lock } from 'lucide-react';
import { Amount } from '@/components/domain/amount';
import { WALLET_TYPE_LABELS, WalletTypeIcon } from '@/components/domain/wallet-type-icon';
import { WalletBalance } from '@/components/domain/wallet-balance';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { WalletRowMenu, type WalletActions } from './wallet-row-menu';

/** Sum of active wallets per currency (cards net of money owed); currencies are never mixed. */
export function totalsByCurrency(wallets: readonly Wallet[]): Array<[string, number]> {
  const totals = new Map<string, number>();
  for (const wallet of wallets) {
    if (wallet.archived) continue;
    totals.set(wallet.currency, (totals.get(wallet.currency) ?? 0) + wallet.balanceMinor);
  }
  return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function WalletTotals({ wallets }: { wallets: readonly Wallet[] }) {
  const totals = totalsByCurrency(wallets);
  if (totals.length === 0) return null;
  return (
    <section
      aria-labelledby="wallet-totals-heading"
      className="mb-6 rounded-md border border-line bg-surface p-4"
    >
      <h2 id="wallet-totals-heading" className="text-body-sm font-medium text-ink-2">
        Total balance
      </h2>
      <dl className="mt-1 flex flex-wrap gap-x-8 gap-y-1">
        {totals.map(([currency, minor]) => (
          <div key={currency} className="flex items-baseline gap-2">
            <dt className="text-body-sm text-ink-3">{currency}</dt>
            <dd className="font-display text-figure-lg font-semibold">
              <Amount minor={minor} currency={currency} />
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-1 text-body-sm text-ink-3">
        Active wallets only. Money owed on cards is subtracted. Currencies are never added together.
      </p>
    </section>
  );
}

interface RowProps {
  wallet: Wallet;
  actions: WalletActions;
  highlighted: boolean;
  layout: 'table' | 'list';
}

function NameLink({ wallet, layout }: { wallet: Wallet; layout: 'table' | 'list' }) {
  return (
    <Link
      to="/transactions"
      search={{ wallet: wallet.id }}
      data-wallet-link={wallet.id}
      dir="auto"
      className={cn(
        'inline-flex min-h-11 items-center font-medium text-ink underline-offset-2 hover:underline',
        layout === 'table' ? 'max-w-full truncate' : 'line-clamp-2',
      )}
    >
      {wallet.name}
    </Link>
  );
}

function ArchivedMark({ wallet, actions }: { wallet: Wallet; actions: WalletActions }) {
  return (
    <>
      <Badge variant="neutral">
        <Lock aria-hidden="true" className="size-3" />
        Archived
      </Badge>
      <Button variant="secondary" size="sm" onClick={() => actions.onUnarchive(wallet)}>
        Unarchive
      </Button>
    </>
  );
}

export function WalletTableRow({ wallet, actions, highlighted }: Omit<RowProps, 'layout'>) {
  return (
    <tr
      data-wallet-row={wallet.id}
      className={cn('border-t border-line', highlighted && 'bg-primary-tint')}
    >
      <th scope="row" className="min-w-48 max-w-0 px-3 py-1 text-left font-normal">
        <div className="flex items-center gap-3">
          <WalletTypeIcon type={wallet.type} />
          <NameLink wallet={wallet} layout="table" />
        </div>
      </th>
      <td className="w-28 px-3 text-body-sm text-ink-2">{WALLET_TYPE_LABELS[wallet.type]}</td>
      <td className="w-24 px-3 text-body-sm text-ink-2">{wallet.currency}</td>
      <td className="w-52 px-3 text-right">
        <WalletBalance wallet={wallet} />
      </td>
      <td className="w-40 px-2">
        <div className="flex items-center justify-end gap-2">
          {wallet.archived ? <ArchivedMark wallet={wallet} actions={actions} /> : null}
          <WalletRowMenu wallet={wallet} actions={actions} />
        </div>
      </td>
    </tr>
  );
}

export function WalletListItem({ wallet, actions, highlighted }: Omit<RowProps, 'layout'>) {
  return (
    <li
      data-wallet-row={wallet.id}
      className={cn(
        'flex min-h-16 items-center gap-3 border-t border-line px-1 py-2',
        highlighted && 'bg-primary-tint',
      )}
    >
      <WalletTypeIcon type={wallet.type} />
      <div className="flex min-w-0 flex-1 flex-col">
        <NameLink wallet={wallet} layout="list" />
        <span className="text-caption text-ink-2">
          {WALLET_TYPE_LABELS[wallet.type]} - {wallet.currency}
        </span>
        {wallet.archived ? (
          <div className="mt-1 flex items-center gap-2">
            <ArchivedMark wallet={wallet} actions={actions} />
          </div>
        ) : null}
      </div>
      <WalletBalance wallet={wallet} />
      <WalletRowMenu wallet={wallet} actions={actions} />
    </li>
  );
}

export function WalletRows({
  wallets,
  actions,
  highlightId,
  layout,
  caption,
}: {
  wallets: readonly Wallet[];
  actions: WalletActions;
  highlightId: string | null;
  layout: 'table' | 'list';
  caption: string;
}) {
  if (layout === 'list') {
    return (
      <ul aria-label={caption} className="m-0 list-none p-0">
        {wallets.map((wallet) => (
          <WalletListItem
            key={wallet.id}
            wallet={wallet}
            actions={actions}
            highlighted={wallet.id === highlightId}
          />
        ))}
      </ul>
    );
  }
  return (
    <table className="w-full table-fixed border-collapse text-body">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="text-left text-body-sm text-ink-2">
          <th scope="col" className="px-3 py-2 font-medium">
            Wallet
          </th>
          <th scope="col" className="w-28 px-3 py-2 font-medium">
            Type
          </th>
          <th scope="col" className="w-24 px-3 py-2 font-medium">
            Currency
          </th>
          <th scope="col" className="w-52 px-3 py-2 text-right font-medium">
            Balance
          </th>
          <th scope="col" className="w-40 px-2 py-2">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {wallets.map((wallet) => (
          <WalletTableRow
            key={wallet.id}
            wallet={wallet}
            actions={actions}
            highlighted={wallet.id === highlightId}
          />
        ))}
      </tbody>
    </table>
  );
}

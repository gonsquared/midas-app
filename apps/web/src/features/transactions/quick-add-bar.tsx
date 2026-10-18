import type { Category, Transaction, Transfer, Wallet } from '@midas/shared';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import type { ComposeType } from './filters';
import { TransactionForm, type TransactionDraft } from './transaction-form-view';
import { TransferForm } from './transfer-form-view';

const OPTIONS = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
] as const;

/**
 * Capture comes first: a one-row form above the filters (lg and up). It is the same form as the
 * composer, so validation, errors and keys behave identically (ui-design 18.3.4).
 */
export function QuickAddBar({
  wallets,
  categories,
  recent,
  loading,
  onAdded,
}: {
  wallets: readonly Wallet[];
  categories: readonly Category[];
  recent: readonly Transaction[] | undefined;
  loading: boolean;
  onAdded: (saved: Transaction | Transfer) => void;
}) {
  const [type, setType] = useState<ComposeType>('expense');
  const [draft, setDraft] = useState<TransactionDraft | undefined>();
  const active = wallets.filter((wallet) => !wallet.archived);

  if (loading) {
    return (
      <div aria-busy="true" className="mb-6 rounded-md border border-line bg-surface p-4">
        <Skeleton className="mb-3 h-6 w-32" />
        <Skeleton className="h-16" />
        <p className="sr-only">Loading your wallets and categories.</p>
      </div>
    );
  }
  if (active.length === 0) {
    return (
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-surface p-4">
        <p className="text-body text-ink-2">Create a wallet before adding transactions.</p>
        <Button asChild>
          <Link to="/wallets/new">Create wallet</Link>
        </Button>
      </div>
    );
  }
  return (
    <section
      aria-labelledby="quick-add-heading"
      className="mb-6 rounded-md border border-line bg-surface p-4"
    >
      <div className="mb-3 flex flex-wrap items-center gap-4">
        <h2 id="quick-add-heading" className="font-display text-subheading font-semibold">
          Quick add
        </h2>
        <Segmented legend="Type" options={OPTIONS} value={type} onChange={setType} />
      </div>
      {type === 'transfer' ? (
        active.length < 2 ? (
          <p className="text-body-sm text-ink-2">
            Transfers need two wallets.{' '}
            <Link to="/wallets/new" className="underline">
              Create wallet
            </Link>
          </p>
        ) : (
          <TransferForm
            layout="bar"
            wallets={wallets}
            draft={draft}
            onDraftChange={setDraft}
            onSaved={onAdded}
          />
        )
      ) : (
        <TransactionForm
          layout="bar"
          type={type}
          wallets={wallets}
          categories={categories}
          recent={recent}
          draft={draft}
          onDraftChange={setDraft}
          onSaved={onAdded}
        />
      )}
    </section>
  );
}

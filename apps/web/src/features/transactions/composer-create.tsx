import type { Transaction, Transfer } from '@midas/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, TrendingDown, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/components/empty-state';
import { ApiErrorAlert } from '@/components/ui/api-error-alert';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { formatMinor } from '@/lib/money';
import { usePreferences } from '@/lib/preferences';
import { Link } from '@tanstack/react-router';
import { peekComposerPrefill, useOverlays } from './composer-store';
import { useComposerData } from './composer-data';
import type { ComposeType } from './filters';
import { OverlayShell } from './overlay-shell';
import { TransactionForm, type TransactionDraft } from './transaction-form-view';
import { TransferForm } from './transfer-form-view';
import type { Wallet } from '@midas/shared';

const TYPE_OPTIONS = [
  { value: 'expense', label: 'Expense', icon: <TrendingDown className="size-4" /> },
  { value: 'income', label: 'Income', icon: <TrendingUp className="size-4" /> },
  { value: 'transfer', label: 'Transfer', icon: <ArrowLeftRight className="size-4" /> },
] as const;

const TITLES: Record<ComposeType, string> = {
  expense: 'Add transaction',
  income: 'Add transaction',
  transfer: 'Move money',
};

/** The Add drawer: expense, income or transfer, opened by ?compose= on any page. */
export function ComposerCreate({ type }: { type: ComposeType }) {
  const data = useComposerData();
  const { closeOverlay, replaceCompose, openTransaction } = useOverlays();
  const prefs = usePreferences();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [dirty, setDirty] = useState(false);
  const [draft, setDraft] = useState<TransactionDraft | undefined>();
  const [prefill] = useState(peekComposerPrefill);

  const walletName = (id: string) => data.wallets.find((wallet) => wallet.id === id)?.name ?? '';
  const balanceText = (walletId: string): string => {
    const fresh = queryClient.getQueryData<Wallet[]>(['wallets'])?.find((w) => w.id === walletId);
    return fresh
      ? ` ${fresh.name} is now ${formatMinor(fresh.balanceMinor, fresh.currency, prefs.locale)}.`
      : '';
  };

  const onTransactionSaved = (saved: Transaction) => {
    setDirty(false);
    toast({
      variant: 'success',
      title: `${saved.type === 'expense' ? 'Expense' : 'Income'} added.${balanceText(saved.wallet.id)}`,
      duration: 8000,
      action: { label: 'View', onSelect: () => openTransaction(saved.id) },
    });
    closeOverlay();
  };

  const onTransferSaved = (saved: Transfer) => {
    setDirty(false);
    toast({
      variant: 'success',
      title: `Moved ${formatMinor(saved.amountMinor, saved.fromWallet.currency, prefs.locale)} from ${walletName(saved.fromWallet.id) || saved.fromWallet.name} to ${saved.toWallet.name}.`,
      duration: 8000,
    });
    closeOverlay();
  };

  const active = data.wallets.filter((wallet) => !wallet.archived);
  let body;
  if (data.isPending) {
    body = <Skeleton className="h-64" />;
  } else if (data.isError) {
    body = (
      <ApiErrorAlert
        error={data.error}
        action={
          <Button variant="secondary" size="sm" onClick={data.retry}>
            Try again
          </Button>
        }
      />
    );
  } else if (active.length === 0) {
    body = (
      <EmptyState
        title="Create a wallet before adding transactions."
        action={
          <Button asChild>
            {/* Replaces the overlay entry: leaving the page must not also pop history. */}
            <Link to="/wallets/new" replace>
              Create wallet
            </Link>
          </Button>
        }
      >
        Every transaction belongs to a wallet.
      </EmptyState>
    );
  } else if (type === 'transfer') {
    body = (
      <TransferForm
        layout="drawer"
        wallets={data.wallets}
        prefill={prefill}
        draft={draft}
        onDraftChange={setDraft}
        onDirtyChange={setDirty}
        onSaved={onTransferSaved}
        onCancel={closeOverlay}
      />
    );
  } else {
    body = (
      <TransactionForm
        layout="drawer"
        type={type}
        wallets={data.wallets}
        categories={data.categories}
        recent={data.recent}
        prefill={prefill}
        draft={draft}
        onDraftChange={setDraft}
        onDirtyChange={setDirty}
        onSaved={onTransactionSaved}
        onCancel={closeOverlay}
      />
    );
  }

  return (
    <OverlayShell
      title={TITLES[type]}
      dirty={dirty}
      onClose={closeOverlay}
      onOpenAutoFocus={(event) => event.preventDefault()}
    >
      <Segmented
        legend="Type"
        options={TYPE_OPTIONS}
        value={type}
        onChange={(next) => replaceCompose(next)}
      />
      {body}
    </OverlayShell>
  );
}

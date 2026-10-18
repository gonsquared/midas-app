import type { Transaction } from '@midas/shared';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Amount } from '@/components/domain/amount';
import { Alert } from '@/components/ui/alert';
import { useAnnounce } from '@/components/ui/announcer';
import { ApiErrorAlert } from '@/components/ui/api-error-alert';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { formatLocalDate } from '@/lib/dates';
import { usePreferences } from '@/lib/preferences';
import { useTransaction, useTransfer } from './api';
import { useComposerData } from './composer-data';
import { DeleteTransactionDialog } from './delete-transaction-dialog';
import { useOverlays } from './composer-store';
import { OverlayShell } from './overlay-shell';
import { TransactionForm } from './transaction-form-view';
import { TransferForm } from './transfer-form-view';

const TYPE_OPTIONS = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
] as const;

function ReadOnly({ transaction, onClose }: { transaction: Transaction; onClose: () => void }) {
  const { locale } = usePreferences();
  const { openCompose } = useOverlays();
  return (
    <div className="flex flex-col gap-4">
      <Alert
        variant="info"
        action={
          <Link to="/wallets" className="underline">
            View wallets
          </Link>
        }
      >
        This transaction is in an archived wallet, so it can&apos;t be changed or deleted. Unarchive{' '}
        {transaction.wallet.name} to edit it.
      </Alert>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body-sm">
        <dt className="text-ink-3">Type</dt>
        <dd className="capitalize">{transaction.type}</dd>
        <dt className="text-ink-3">Amount</dt>
        <dd>
          <Amount minor={transaction.amountMinor} currency={transaction.currency} />
        </dd>
        <dt className="text-ink-3">Category</dt>
        <dd>{transaction.category?.name ?? 'Transfer'}</dd>
        <dt className="text-ink-3">Wallet</dt>
        <dd>{transaction.wallet.name}</dd>
        <dt className="text-ink-3">Date</dt>
        <dd>{formatLocalDate(transaction.occurredOn, locale, { dateStyle: 'medium' })}</dd>
        <dt className="text-ink-3">Note</dt>
        <dd dir="auto" className="whitespace-pre-wrap">
          {transaction.note ?? 'None'}
        </dd>
      </dl>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
        {transaction.type !== 'transfer' ? (
          <Button
            onClick={() =>
              openCompose(transaction.type === 'income' ? 'income' : 'expense', {
                categoryId: transaction.category?.id ?? '',
                amountMinor: transaction.amountMinor,
                note: transaction.note,
              })
            }
          >
            Duplicate
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function TransactionDetail({ id }: { id: string }) {
  const { closeOverlay } = useOverlays();
  const transactionQuery = useTransaction(id);
  const transaction = transactionQuery.data;
  const transferId = transaction?.transfer?.transferId;
  const transferQuery = useTransfer(transferId);
  const data = useComposerData();
  const [dirty, setDirty] = useState(false);
  const [type, setType] = useState<'income' | 'expense' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const prefs = usePreferences();
  const announce = useAnnounce();

  const done = (message: string) => {
    setDirty(false);
    announce(message);
    closeOverlay();
    window.setTimeout(() => document.querySelector<HTMLElement>('main h1')?.focus(), 0);
  };

  let title = 'Edit transaction';
  let body;
  const notFound =
    transactionQuery.isError &&
    (transactionQuery.error as { status?: number } | null)?.status === 404;

  if (transactionQuery.isPending || (transferId && transferQuery.isPending) || data.isPending) {
    body = <Skeleton className="h-64" />;
  } else if (notFound) {
    title = 'Transaction';
    body = (
      <div className="flex flex-col items-start gap-3">
        <p>This transaction doesn&apos;t exist or was deleted.</p>
        <Button onClick={closeOverlay}>Back to transactions</Button>
      </div>
    );
  } else if (transactionQuery.isError || transferQuery.isError || data.isError || !transaction) {
    title = 'Transaction';
    body = (
      <ApiErrorAlert
        error={transactionQuery.error ?? transferQuery.error ?? data.error}
        action={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void transactionQuery.refetch();
              void transferQuery.refetch();
              data.retry();
            }}
          >
            Try again
          </Button>
        }
      />
    );
  } else if (
    transaction.wallet.archived ||
    transferQuery.data?.fromWallet.archived ||
    transferQuery.data?.toWallet.archived
  ) {
    title = transferId ? 'Transfer' : 'Transaction';
    body = <ReadOnly transaction={transaction} onClose={closeOverlay} />;
  } else if (transferId && transferQuery.data) {
    title = 'Edit transfer';
    body = (
      <TransferForm
        layout="drawer"
        wallets={data.wallets}
        transfer={transferQuery.data}
        onDirtyChange={setDirty}
        onSaved={() => done('Transfer updated.')}
        onCancel={closeOverlay}
        onDelete={() => setConfirmDelete(true)}
        onGone={closeOverlay}
      />
    );
  } else {
    const current = type ?? (transaction.type === 'income' ? 'income' : 'expense');
    title = `Edit ${current}`;
    body = (
      <>
        <Segmented legend="Type" options={TYPE_OPTIONS} value={current} onChange={setType} />
        <TransactionForm
          layout="drawer"
          type={current}
          wallets={data.wallets}
          categories={data.categories}
          recent={data.recent}
          transaction={transaction}
          onDirtyChange={setDirty}
          onSaved={() => done(`${current === 'expense' ? 'Expense' : 'Income'} updated.`)}
          onCancel={closeOverlay}
          onDelete={() => setConfirmDelete(true)}
          onGone={closeOverlay}
          onTransferLeg={() => void transactionQuery.refetch()}
        />
      </>
    );
  }

  const when = transaction
    ? `Created ${formatLocalDate(transaction.createdAt.slice(0, 10), prefs.locale, { dateStyle: 'medium' })}`
    : undefined;

  return (
    <>
      <OverlayShell
        title={title}
        {...(when ? { description: when } : {})}
        dirty={dirty}
        onClose={closeOverlay}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        {transaction?.recurringTemplateId ? (
          <Alert variant="info">
            Added by a recurring transaction. Editing changes only this transaction.
          </Alert>
        ) : null}
        {body}
      </OverlayShell>
      {transaction ? (
        <DeleteTransactionDialog
          transaction={transaction}
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          onDeleted={(message) => {
            setConfirmDelete(false);
            done(message);
          }}
        />
      ) : null}
    </>
  );
}

import type { Transaction, Wallet } from '@midas/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { formatLocalDate } from '@/lib/dates';
import { formatMinor } from '@/lib/money';
import { usePreferences } from '@/lib/preferences';
import { deleteTransaction, deleteTransfer, useInvalidateLedger } from './api';

/** Deleting always asks first (ui-design 5.6). Transfer legs delete the whole transfer. */
export function DeleteTransactionDialog({
  transaction,
  open = true,
  onOpenChange,
  onDeleted,
  onCloseAutoFocus,
}: {
  transaction: Transaction;
  open?: boolean;
  onOpenChange: (open: boolean) => void;
  /** Receives the confirmation sentence, for example "Expense deleted. Checking is now $1,180.00." */
  onDeleted: (message: string) => void;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const { locale } = usePreferences();
  const queryClient = useQueryClient();
  const invalidateLedger = useInvalidateLedger();
  const transferId = transaction.transfer?.transferId;
  const noun = transferId ? 'transfer' : transaction.type;
  const amount = formatMinor(transaction.amountMinor, transaction.currency, locale);
  const wallet = queryClient
    .getQueryData<Wallet[]>(['wallets'])
    ?.find((candidate) => candidate.id === transaction.wallet.id);

  const consequences = transferId
    ? ['Both wallets change and both rows are removed.']
    : [
        `${amount}${transaction.category ? `, ${transaction.category.name}` : ''}, ${formatLocalDate(transaction.occurredOn, locale, { day: 'numeric', month: 'short' })}.`,
        `${transaction.wallet.name} will go ${transaction.type === 'income' ? 'down' : 'up'} by ${amount}.`,
      ];
  if (transaction.recurringTemplateId) {
    consequences.push("This was added by a recurring transaction. It won't be added again.");
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={transferId ? 'Delete this transfer?' : `Delete this ${transaction.type}?`}
      consequences={consequences}
      reversibleNote="This can't be undone."
      confirmLabel={`Delete ${noun}`}
      {...(onCloseAutoFocus ? { onCloseAutoFocus } : {})}
      onConfirm={async () => {
        if (transferId) await deleteTransfer(transferId);
        else await deleteTransaction(transaction.id);
        await invalidateLedger();
        const fresh = queryClient
          .getQueryData<Wallet[]>(['wallets'])
          ?.find((candidate) => candidate.id === transaction.wallet.id);
        const balance = fresh
          ? ` ${fresh.name} is now ${formatMinor(fresh.balanceMinor, fresh.currency, locale)}.`
          : wallet
            ? ''
            : '';
        onDeleted(`${noun[0]!.toUpperCase()}${noun.slice(1)} deleted.${balance}`);
      }}
    />
  );
}

import type { Wallet } from '@midas/shared';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ApiError } from '@/lib/api-client';
import { formatMinor } from '@/lib/money';
import { usePreferences } from '@/lib/preferences';
import { archiveWallet, deleteWallet, useInvalidateWallets } from './api';

interface DialogProps {
  wallet: Wallet;
  onClose: () => void;
  onCloseAutoFocus?: (event: Event) => void;
}

export function ArchiveWalletDialog({
  wallet,
  onClose,
  onDone,
  onCloseAutoFocus,
}: DialogProps & { onDone: (wallet: Wallet) => void }) {
  const { locale } = usePreferences();
  const invalidate = useInvalidateWallets();
  const consequences = [
    "It's hidden from lists and pickers, and can't receive transactions or transfers.",
    ...(wallet.balanceMinor !== 0
      ? [
          `Its balance of ${formatMinor(wallet.balanceMinor, wallet.currency, locale)} stops counting toward your total balance.`,
        ]
      : []),
    'Its history stays in your transactions and reports.',
    "Any active recurring transactions that use it will be paused. They won't restart if you unarchive.",
  ];
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Archive ${wallet.name}?`}
      consequences={consequences}
      reversibleNote="You can unarchive it at any time."
      confirmLabel="Archive wallet"
      confirmTone="primary"
      {...(onCloseAutoFocus ? { onCloseAutoFocus } : {})}
      onConfirm={async () => {
        const archived = await archiveWallet(wallet.id);
        await invalidate();
        onDone(archived);
      }}
    />
  );
}

export function DeleteWalletDialog({
  wallet,
  onClose,
  onDone,
  onSwitchToArchive,
  onCloseAutoFocus,
}: DialogProps & {
  onDone: (wallet: Wallet) => void;
  onSwitchToArchive: (wallet: Wallet) => void;
}) {
  const invalidate = useInvalidateWallets();
  const [inUse, setInUse] = useState(false);
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Delete ${wallet.name}?`}
      consequences={["This can't be undone. It has no transactions."]}
      confirmLabel="Delete wallet"
      {...(onCloseAutoFocus ? { onCloseAutoFocus } : {})}
      error={
        inUse ? (
          <Alert variant="danger">
            This wallet is used by recurring transactions, so it can't be deleted. Archive it
            instead.
          </Alert>
        ) : undefined
      }
      extraActions={
        inUse ? (
          <>
            <Button variant="secondary" onClick={() => onSwitchToArchive(wallet)}>
              Archive wallet
            </Button>
            <Button asChild variant="link">
              <Link to="/recurring">View recurring</Link>
            </Button>
          </>
        ) : undefined
      }
      onConfirm={async () => {
        try {
          await deleteWallet(wallet.id);
        } catch (caught) {
          if (caught instanceof ApiError && caught.code === 'WALLET_IN_USE') {
            setInUse(true);
            return;
          }
          throw caught;
        }
        await invalidate();
        onDone(wallet);
      }}
    />
  );
}

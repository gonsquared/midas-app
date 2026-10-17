import type { Wallet } from '@midas/shared';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { useNavigate } from '@tanstack/react-router';
import { MoreHorizontal } from 'lucide-react';
import { menuContentClass, menuItemClass } from '@/app/shell/add-menu';
import { IconButton } from '@/components/ui/icon-button';

export interface WalletActions {
  onArchive: (wallet: Wallet) => void;
  onUnarchive: (wallet: Wallet) => void;
  onDelete: (wallet: Wallet) => void;
}

/** Row actions. The disabled Delete item stays focusable so keyboard users can read why. */
export function WalletRowMenu({ wallet, actions }: { wallet: Wallet; actions: WalletActions }) {
  const navigate = useNavigate();
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger asChild>
        <IconButton
          label={`Actions for ${wallet.name}`}
          size="sm"
          className="pointer-coarse:size-11"
          icon={<MoreHorizontal className="size-4" />}
        />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={6} className={`${menuContentClass} max-w-72`}>
          <Menu.Item
            className={menuItemClass}
            onSelect={() => void navigate({ to: '/transactions', search: { wallet: wallet.id } })}
          >
            View transactions
          </Menu.Item>
          {wallet.archived ? (
            <Menu.Item className={menuItemClass} onSelect={() => actions.onUnarchive(wallet)}>
              Unarchive wallet
            </Menu.Item>
          ) : (
            <>
              <Menu.Item
                className={menuItemClass}
                onSelect={() =>
                  void navigate({ to: '/wallets/$walletId/edit', params: { walletId: wallet.id } })
                }
              >
                Edit wallet
              </Menu.Item>
              <Menu.Item className={menuItemClass} onSelect={() => actions.onArchive(wallet)}>
                Archive wallet
              </Menu.Item>
            </>
          )}
          <Menu.Separator className="my-1 h-px bg-line" />
          {wallet.hasTransactions ? (
            <Menu.Item
              aria-disabled="true"
              className={`${menuItemClass} h-auto min-h-9 py-1.5 text-ink-3`}
              onSelect={(event) => event.preventDefault()}
            >
              Delete is unavailable. This wallet has transactions. Archive it instead.
            </Menu.Item>
          ) : (
            <Menu.Item
              className={`${menuItemClass} text-danger`}
              onSelect={() => actions.onDelete(wallet)}
            >
              Delete wallet
            </Menu.Item>
          )}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

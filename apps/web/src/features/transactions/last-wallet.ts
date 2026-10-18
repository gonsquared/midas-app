import type { Wallet } from '@midas/shared';

/**
 * The last-used wallet id is a UI preference kept in local storage per user. It is an opaque id,
 * never a financial value (ui-design 18.3.2, 15.1).
 */
const key = (userId: string) => `midas.lastWallet.${userId}`;

export function readLastWallet(userId: string | undefined): string | null {
  if (!userId) return null;
  try {
    return window.localStorage.getItem(key(userId));
  } catch {
    return null;
  }
}

export function storeLastWallet(userId: string | undefined, walletId: string): void {
  if (!userId) return;
  try {
    window.localStorage.setItem(key(userId), walletId);
  } catch {
    // Storage may be blocked; the default simply falls back to the first wallet.
  }
}

/** Last-used wallet if still active, otherwise the first active wallet by name. */
export function defaultWalletId(
  wallets: readonly Wallet[],
  userId: string | undefined,
): string | null {
  const active = wallets.filter((wallet) => !wallet.archived);
  const last = readLastWallet(userId);
  if (last && active.some((wallet) => wallet.id === last)) return last;
  return [...active].sort((a, b) => a.name.localeCompare(b.name))[0]?.id ?? null;
}

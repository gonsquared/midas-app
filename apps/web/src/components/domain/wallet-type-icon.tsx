import type { WalletType } from '@midas/shared';
import { Banknote, CreditCard, Landmark, PiggyBank, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export const WALLET_TYPE_ICONS: Record<WalletType, LucideIcon> = {
  cash: Banknote,
  bank: Landmark,
  card: CreditCard,
  savings: PiggyBank,
};

export const WALLET_TYPE_LABELS: Record<WalletType, string> = {
  cash: 'Cash',
  bank: 'Bank',
  card: 'Card',
  savings: 'Savings',
};

export const WALLET_TYPE_HINTS: Record<WalletType, string> = {
  cash: 'Physical money',
  bank: 'Checking or current account',
  card: 'Credit or debit. Below zero means you owe',
  savings: 'Money set aside',
};

/** Decorative: the type is always written out next to it. */
export function WalletTypeIcon({ type, className }: { type: WalletType; className?: string }) {
  const Icon = WALLET_TYPE_ICONS[type];
  return <Icon aria-hidden="true" className={cn('size-5 text-ink-2', className)} />;
}

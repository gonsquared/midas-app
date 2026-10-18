import type { Wallet } from '@midas/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import { formatMinor } from '@/lib/money';
import { usePreferences } from '@/lib/preferences';
import { Amount } from './amount';

export type BalanceQualifier = 'owed' | 'credit' | 'overdrawn' | null;

/** ui-design 18.1.4: a card below zero is "owed", other wallets below zero are "overdrawn". */
export function balanceQualifier(wallet: Pick<Wallet, 'type' | 'balanceMinor'>): BalanceQualifier {
  if (wallet.balanceMinor < 0) return wallet.type === 'card' ? 'owed' : 'overdrawn';
  if (wallet.balanceMinor > 0 && wallet.type === 'card') return 'credit';
  return null;
}

/** Spoken form of the balance cell, for example "minus $2,400.00, owed". */
export function balanceSpeech(
  wallet: Pick<Wallet, 'type' | 'balanceMinor' | 'currency'>,
  locale: string,
): string {
  const qualifier = balanceQualifier(wallet);
  const magnitude = formatMinor(Math.abs(wallet.balanceMinor), wallet.currency, locale);
  const amount = wallet.balanceMinor < 0 ? `minus ${magnitude}` : magnitude;
  return qualifier ? `${amount}, ${qualifier}` : amount;
}

export function WalletBalance({
  wallet,
  className,
}: {
  wallet: Pick<Wallet, 'type' | 'balanceMinor' | 'currency'>;
  className?: string;
}) {
  const { locale } = usePreferences();
  const qualifier = balanceQualifier(wallet);
  const tone = qualifier === 'overdrawn' ? 'danger' : 'ink';
  return (
    <div className={cn('flex min-h-11 flex-col items-end justify-center', className)}>
      <span className="sr-only">{balanceSpeech(wallet, locale)}</span>
      <span aria-hidden="true">
        <Amount minor={wallet.balanceMinor} currency={wallet.currency} tone={tone} />
      </span>
      <span aria-hidden="true" className="min-h-4 text-caption">
        {qualifier === 'owed' ? <span className="text-ink-2">owed</span> : null}
        {qualifier === 'credit' ? <span className="text-ink-3">credit</span> : null}
        {qualifier === 'overdrawn' ? <Badge variant="danger">Overdrawn</Badge> : null}
      </span>
    </div>
  );
}

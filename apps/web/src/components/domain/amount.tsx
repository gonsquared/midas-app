import { cn } from '@/lib/cn';
import { formatMinor, type SignMode } from '@/lib/money';
import { usePreferences } from '@/lib/preferences';

export type AmountTone = 'ink' | 'income' | 'danger' | 'muted';

const TONES: Record<AmountTone, string> = {
  ink: 'text-ink',
  income: 'text-income',
  danger: 'text-danger',
  muted: 'text-ink-2',
};

export interface AmountProps {
  minor: number;
  currency: string;
  sign?: SignMode;
  tone?: AmountTone;
  className?: string;
}

/**
 * The single source of money display: locale, exponent, true minus and tabular figures come from
 * the user's preferences. When the currency differs from the preference the code is appended
 * (symbols are ambiguous).
 */
export function Amount({ minor, currency, sign = 'auto', tone = 'ink', className }: AmountProps) {
  const { currency: preferred, locale } = usePreferences();
  const text = formatMinor(minor, currency, locale, { sign });
  return (
    <span dir="ltr" className={cn('tabular whitespace-nowrap', TONES[tone], className)}>
      {text}
      {currency !== preferred ? (
        <span className="ml-1 text-caption text-ink-3">{currency}</span>
      ) : null}
    </span>
  );
}

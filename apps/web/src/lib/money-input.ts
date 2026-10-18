import { currencyExponent, parseMoney } from './money';

export interface AmountInputOptions {
  currency: string;
  locale: string;
  allowNegative?: boolean;
  /** An empty value is an error ("Enter an amount greater than 0."). */
  required?: boolean;
  /** Zero is rejected (transaction amounts must be greater than 0). */
  positive?: boolean;
}

export interface AmountInputResult {
  minor: number | null;
  error?: string;
}

/** Validates what the user typed in a money field and explains problems in plain words. */
export function parseAmountInput(text: string, options: AmountInputOptions): AmountInputResult {
  const { currency, locale, allowNegative = false, required = false, positive = false } = options;
  const parsed = parseMoney(text, { currency, locale, allowNegative });
  if (!parsed.ok) {
    switch (parsed.reason) {
      case 'decimals': {
        const exponent = currencyExponent(currency);
        return {
          minor: null,
          error:
            exponent === 0
              ? `${currency} has no decimal places.`
              : `${currency} has ${exponent} decimal places.`,
        };
      }
      case 'negative':
        return { minor: null, error: 'Amounts cannot be negative here.' };
      case 'range':
        return { minor: null, error: 'Amount is too large.' };
      default:
        return { minor: null, error: 'Enter an amount like 12.50.' };
    }
  }
  if (parsed.minor === null) {
    return required || positive
      ? { minor: null, error: 'Enter an amount greater than 0.' }
      : { minor: null };
  }
  if (positive && parsed.minor <= 0) {
    return { minor: null, error: 'Enter an amount greater than 0.' };
  }
  return { minor: parsed.minor };
}

import { describe, expect, it } from 'vitest';
import { parseAmountInput } from './money-input';

const usd = { currency: 'USD', locale: 'en-US' } as const;

describe('parseAmountInput', () => {
  it('accepts valid amounts', () => {
    expect(parseAmountInput('12.50', { ...usd, positive: true })).toEqual({ minor: 1250 });
    expect(parseAmountInput('', usd)).toEqual({ minor: null });
    expect(parseAmountInput('-35', { ...usd, allowNegative: true })).toEqual({ minor: -3500 });
  });

  it('explains each failure in plain words', () => {
    expect(parseAmountInput('', { ...usd, required: true }).error).toBe(
      'Enter an amount greater than 0.',
    );
    expect(parseAmountInput('0', { ...usd, positive: true }).error).toBe(
      'Enter an amount greater than 0.',
    );
    expect(parseAmountInput('12.345', usd).error).toBe('USD has 2 decimal places.');
    expect(parseAmountInput('1.5', { currency: 'JPY', locale: 'en-US' }).error).toBe(
      'JPY has no decimal places.',
    );
    expect(parseAmountInput('abc', usd).error).toBe('Enter an amount like 12.50.');
    expect(parseAmountInput('-5', usd).error).toBe('Amounts cannot be negative here.');
    expect(parseAmountInput('1000000000000.01', usd).error).toBe('Amount is too large.');
  });
});

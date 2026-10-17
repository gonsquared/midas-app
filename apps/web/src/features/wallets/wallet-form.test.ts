import { describe, expect, it } from 'vitest';
import { makeWallet } from '@/test/fixtures';
import {
  initialValues,
  isDirty,
  toUpdateRequest,
  validateWalletForm,
  type WalletFormValues,
} from './wallet-form';

const base: WalletFormValues = { name: 'Everyday', type: 'bank', currency: 'USD', opening: '' };

describe('validateWalletForm', () => {
  it('accepts a minimal wallet and defaults the opening balance to zero', () => {
    const { valid, errors } = validateWalletForm(base, 'en-US');
    expect(errors).toEqual({});
    expect(valid).toEqual({
      name: 'Everyday',
      type: 'bank',
      currency: 'USD',
      openingBalanceMinor: 0,
    });
  });

  it('reports each problem on its field', () => {
    const { errors, valid } = validateWalletForm(
      { name: '  ', type: null, currency: '', opening: 'abc' },
      'en-US',
    );
    expect(valid).toBeNull();
    expect(errors).toMatchObject({
      name: 'Enter a name.',
      type: 'Choose a type.',
      currency: 'Choose a currency.',
      opening: 'Enter an amount like 12.50.',
    });
    expect(validateWalletForm({ ...base, name: 'x'.repeat(61) }, 'en-US').errors.name).toMatch(
      /60/,
    );
  });

  it('allows a negative opening balance and respects the currency exponent', () => {
    expect(
      validateWalletForm({ ...base, opening: '-35.50' }, 'en-US').valid?.openingBalanceMinor,
    ).toBe(-3550);
    expect(validateWalletForm({ ...base, opening: '1.234' }, 'en-US').errors.opening).toBe(
      'USD has 2 decimal places.',
    );
  });
});

describe('edit helpers', () => {
  const wallet = makeWallet({ name: 'Checking', openingBalanceMinor: 100000, currency: 'USD' });

  it('detects changes and builds a minimal patch', () => {
    const initial = initialValues(wallet, { currency: 'USD', locale: 'en-US' });
    expect(initial.opening).toBe('1000.00');
    expect(isDirty(initial, initial)).toBe(false);
    const edited = { ...initial, name: 'Main', opening: '1200.00' };
    expect(isDirty(edited, initial)).toBe(true);
    const { valid } = validateWalletForm(edited, 'en-US');
    expect(toUpdateRequest(valid!, wallet)).toEqual({ name: 'Main', openingBalanceMinor: 120000 });
  });
});

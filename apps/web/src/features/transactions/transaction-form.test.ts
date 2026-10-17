import { describe, expect, it } from 'vitest';
import { makeCategory, makeTransaction, makeWallet } from '@/test/fixtures';
import {
  toUpdateTransaction,
  validateTransactionForm,
  type TransactionFormValues,
} from './transaction-form';

const wallet = makeWallet({ currency: 'USD' });
const category = makeCategory();
const context = { wallets: [wallet], locale: 'en-US', fallbackCurrency: 'USD' };
const base: TransactionFormValues = {
  type: 'expense',
  amount: '54.20',
  categoryId: category.id,
  walletId: wallet.id,
  date: '2026-10-16',
  note: '  Weekly shop ',
};

describe('validateTransactionForm', () => {
  it('builds the API payload with integer minor units and a trimmed note', () => {
    expect(validateTransactionForm(base, context).valid).toEqual({
      type: 'expense',
      walletId: wallet.id,
      categoryId: category.id,
      amountMinor: 5420,
      occurredOn: '2026-10-16',
      note: 'Weekly shop',
    });
    expect(validateTransactionForm({ ...base, note: '   ' }, context).valid?.note).toBeNull();
  });

  it('explains every invalid field', () => {
    const { errors, valid } = validateTransactionForm(
      {
        ...base,
        amount: '0',
        categoryId: null,
        walletId: null,
        date: '2026-02-31',
        note: 'x'.repeat(501),
      },
      context,
    );
    expect(valid).toBeNull();
    expect(errors).toEqual({
      amount: 'Enter an amount greater than 0.',
      category: 'Choose a category.',
      wallet: 'Choose a wallet.',
      date: 'Enter a valid date.',
      note: 'Keep notes under 500 characters.',
    });
  });

  it('limits decimals to the wallet currency instead of rounding', () => {
    const yen = makeWallet({ currency: 'JPY' });
    const result = validateTransactionForm(
      { ...base, walletId: yen.id, amount: '10.5' },
      { ...context, wallets: [yen] },
    );
    expect(result.errors.amount).toBe('JPY has no decimal places.');
  });

  it('rejects control characters in the note', () => {
    expect(
      validateTransactionForm({ ...base, note: 'bad\u0007note' }, context).errors.note,
    ).toMatch(/special characters/);
  });
});

describe('toUpdateTransaction', () => {
  it('sends only changed fields and the category when the type changes', () => {
    const original = makeTransaction({
      wallet: wallet,
      category: { ...category },
      amountMinor: 5420,
      note: 'Weekly shop',
    });
    const same = validateTransactionForm(base, context).valid!;
    expect(toUpdateTransaction(same, original)).toEqual({});
    const income = makeCategory({ type: 'income' });
    const changed = { ...same, type: 'income' as const, categoryId: income.id, amountMinor: 100 };
    expect(toUpdateTransaction(changed, original)).toEqual({
      type: 'income',
      categoryId: income.id,
      amountMinor: 100,
    });
  });
});

import type { Transfer } from '@midas/shared';
import { describe, expect, it } from 'vitest';
import { makeWallet, uuid } from '@/test/fixtures';
import {
  toUpdateTransfer,
  transferPreview,
  validateTransferForm,
  type TransferFormValues,
} from './transfer-form';

const checking = makeWallet({ name: 'Checking', balanceMinor: 120000, currency: 'USD' });
const savings = makeWallet({
  name: 'Savings',
  balanceMinor: 500000,
  currency: 'USD',
  type: 'savings',
});
const euro = makeWallet({ name: 'Euro', balanceMinor: 10000, currency: 'EUR' });
const context = { wallets: [checking, savings, euro], locale: 'en-US' };
const base: TransferFormValues = {
  fromId: checking.id,
  toId: savings.id,
  amount: '200',
  toAmount: '',
  date: '2026-10-16',
  note: '',
};

describe('validateTransferForm', () => {
  it('builds a same-currency payload without toAmountMinor', () => {
    expect(validateTransferForm(base, context).valid).toEqual({
      fromWalletId: checking.id,
      toWalletId: savings.id,
      amountMinor: 20000,
      occurredOn: '2026-10-16',
      note: null,
    });
  });

  it('requires the received amount only when currencies differ', () => {
    const cross = { ...base, toId: euro.id };
    expect(validateTransferForm(cross, context).errors.toAmount).toBe(
      'Enter the amount they receive.',
    );
    expect(validateTransferForm({ ...cross, toAmount: '184' }, context).valid).toMatchObject({
      amountMinor: 20000,
      toAmountMinor: 18400,
    });
  });

  it('reports missing wallets, the same wallet, and a bad amount', () => {
    expect(
      validateTransferForm({ ...base, fromId: null, toId: null, amount: '' }, context).errors,
    ).toEqual({
      from: 'Choose a wallet.',
      to: 'Choose a wallet.',
      amount: 'Enter an amount greater than 0.',
    });
    expect(validateTransferForm({ ...base, toId: checking.id }, context).errors.to).toBe(
      'Choose a different wallet.',
    );
  });
});

describe('transferPreview', () => {
  it('shows before and after for each wallet and flags overdrawn non-card wallets', () => {
    const [from, to] = transferPreview({
      from: checking,
      to: savings,
      amountMinor: 20000,
      toAmountMinor: 20000,
    });
    expect([from!.before, from!.after, to!.before, to!.after]).toEqual([
      120000, 100000, 500000, 520000,
    ]);
    const [over] = transferPreview({
      from: checking,
      to: savings,
      amountMinor: 200000,
      toAmountMinor: 200000,
    });
    expect(over!.overdrawn).toBe(true);
  });

  it('excludes the transfer being edited from the starting balances', () => {
    const editing = {
      fromWallet: { id: checking.id },
      toWallet: { id: savings.id },
      amountMinor: 5000,
      toAmountMinor: 5000,
    } as Transfer;
    const [from, to] = transferPreview({
      from: { ...checking, balanceMinor: 115000 },
      to: { ...savings, balanceMinor: 505000 },
      amountMinor: 20000,
      toAmountMinor: 20000,
      editing,
    });
    expect([from!.before, to!.before]).toEqual([120000, 500000]);
  });
});

describe('toUpdateTransfer', () => {
  it('sends only what changed', () => {
    const original = {
      id: uuid(),
      fromWallet: { id: checking.id },
      toWallet: { id: savings.id },
      amountMinor: 20000,
      toAmountMinor: 20000,
      occurredOn: '2026-10-16',
      note: null,
    } as Transfer;
    const form = validateTransferForm({ ...base, amount: '250', note: 'Rent' }, context).valid!;
    expect(toUpdateTransfer(form, original)).toEqual({ amountMinor: 25000, note: 'Rent' });
  });
});

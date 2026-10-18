import type { CreateTransferRequest, Transfer, UpdateTransferRequest, Wallet } from '@midas/shared';
import { NOTE_MAX_LENGTH, isValidLocalDate } from '@midas/shared/money';
import { parseAmountInput } from '@/lib/money-input';

export interface TransferFormValues {
  fromId: string | null;
  toId: string | null;
  amount: string;
  toAmount: string;
  date: string;
  note: string;
}

export type TransferFormField = 'from' | 'to' | 'amount' | 'toAmount' | 'date' | 'note';
export type TransferFormErrors = Partial<Record<TransferFormField, string>>;

export interface ValidTransferForm {
  fromWalletId: string;
  toWalletId: string;
  amountMinor: number;
  /** Present only when the wallets use different currencies. */
  toAmountMinor?: number;
  occurredOn: string;
  note: string | null;
}

export const TRANSFER_FIELD_MAP = {
  fromWalletId: 'from',
  toWalletId: 'to',
  amountMinor: 'amount',
  toAmountMinor: 'toAmount',
  occurredOn: 'date',
  note: 'note',
} as const;

export function currenciesDiffer(from: Wallet | undefined, to: Wallet | undefined): boolean {
  return Boolean(from && to && from.currency !== to.currency);
}

export function validateTransferForm(
  values: TransferFormValues,
  context: { wallets: readonly Wallet[]; locale: string },
): { errors: TransferFormErrors; valid: ValidTransferForm | null } {
  const errors: TransferFormErrors = {};
  const from = context.wallets.find((wallet) => wallet.id === values.fromId);
  const to = context.wallets.find((wallet) => wallet.id === values.toId);
  if (!from) errors.from = 'Choose a wallet.';
  if (!to) errors.to = 'Choose a wallet.';
  else if (from && to.id === from.id) errors.to = 'Choose a different wallet.';
  const amount = parseAmountInput(values.amount, {
    currency: from?.currency ?? 'USD',
    locale: context.locale,
    positive: true,
  });
  if (amount.error) errors.amount = amount.error;
  const differ = currenciesDiffer(from, to);
  let toAmountMinor: number | undefined;
  if (differ && to) {
    const received = parseAmountInput(values.toAmount, {
      currency: to.currency,
      locale: context.locale,
      positive: true,
    });
    if (received.minor === null) {
      errors.toAmount = values.toAmount.trim()
        ? (received.error ?? 'Enter the amount they receive.')
        : 'Enter the amount they receive.';
    } else toAmountMinor = received.minor;
  }
  if (!isValidLocalDate(values.date)) errors.date = 'Enter a valid date.';
  const note = values.note.trim();
  if (note.length > NOTE_MAX_LENGTH) errors.note = 'Keep notes under 500 characters.';
  if (Object.keys(errors).length > 0 || !from || !to || amount.minor === null) {
    return { errors, valid: null };
  }
  return {
    errors,
    valid: {
      fromWalletId: from.id,
      toWalletId: to.id,
      amountMinor: amount.minor,
      ...(toAmountMinor !== undefined ? { toAmountMinor } : {}),
      occurredOn: values.date,
      note: note === '' ? null : note,
    },
  };
}

export const toCreateTransfer = (form: ValidTransferForm): CreateTransferRequest => ({ ...form });

/** Changed fields only; when currencies differ the received amount always travels with it. */
export function toUpdateTransfer(
  form: ValidTransferForm,
  original: Transfer,
): UpdateTransferRequest {
  const patch: UpdateTransferRequest = {};
  if (form.fromWalletId !== original.fromWallet.id) patch.fromWalletId = form.fromWalletId;
  if (form.toWalletId !== original.toWallet.id) patch.toWalletId = form.toWalletId;
  if (form.amountMinor !== original.amountMinor) patch.amountMinor = form.amountMinor;
  if (form.toAmountMinor !== undefined && form.toAmountMinor !== original.toAmountMinor) {
    patch.toAmountMinor = form.toAmountMinor;
  }
  if (form.occurredOn !== original.occurredOn) patch.occurredOn = form.occurredOn;
  if (form.note !== original.note) patch.note = form.note;
  return patch;
}

export interface TransferPreviewLine {
  walletId: string;
  name: string;
  currency: string;
  type: Wallet['type'];
  before: number;
  after: number;
  overdrawn: boolean;
}

/**
 * Before and after balances for each wallet. In edit mode "before" excludes the transfer being
 * edited, so the numbers show the true effect of saving.
 */
export function transferPreview(input: {
  from: Wallet;
  to: Wallet;
  amountMinor: number;
  toAmountMinor: number;
  editing?: Transfer | undefined;
}): TransferPreviewLine[] {
  const { from, to, amountMinor, toAmountMinor, editing } = input;
  const undo = (wallet: Wallet): number => {
    if (!editing) return wallet.balanceMinor;
    let balance = wallet.balanceMinor;
    if (editing.fromWallet.id === wallet.id) balance += editing.amountMinor;
    if (editing.toWallet.id === wallet.id) balance -= editing.toAmountMinor;
    return balance;
  };
  const line = (wallet: Wallet, delta: number): TransferPreviewLine => {
    const before = undo(wallet);
    const after = before + delta;
    return {
      walletId: wallet.id,
      name: wallet.name,
      currency: wallet.currency,
      type: wallet.type,
      before,
      after,
      overdrawn: after < 0 && wallet.type !== 'card',
    };
  };
  return [line(from, -amountMinor), line(to, toAmountMinor)];
}

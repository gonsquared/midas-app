import type {
  CreateTransactionRequest,
  Transaction,
  UpdateTransactionRequest,
  Wallet,
} from '@midas/shared';
import { NOTE_MAX_LENGTH, isValidLocalDate } from '@midas/shared/money';
import { parseAmountInput } from '@/lib/money-input';

export type EditableType = 'income' | 'expense';

export interface TransactionFormValues {
  type: EditableType;
  amount: string;
  categoryId: string | null;
  walletId: string | null;
  date: string;
  note: string;
}

export type TransactionFormField = 'amount' | 'category' | 'wallet' | 'date' | 'note';
export type TransactionFormErrors = Partial<Record<TransactionFormField, string>>;

export interface ValidTransactionForm {
  type: EditableType;
  walletId: string;
  categoryId: string;
  amountMinor: number;
  occurredOn: string;
  note: string | null;
}

/** Server `FieldError.field` to form field (ui-design 18.3.7). */
export const TRANSACTION_FIELD_MAP = {
  amountMinor: 'amount',
  occurredOn: 'date',
  note: 'note',
  walletId: 'wallet',
  categoryId: 'category',
} as const;

// Control characters other than tab and newline are rejected by the API (NUL is not storable).
function hasForbiddenNoteChars(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    const control = code < 0x20 || (code >= 0x7f && code <= 0x9f);
    if (control && code !== 0x09 && code !== 0x0a && code !== 0x0d) return true;
  }
  return /\p{Cf}/u.test(value);
}

export function validateTransactionForm(
  values: TransactionFormValues,
  context: { wallets: readonly Wallet[]; locale: string; fallbackCurrency: string },
): { errors: TransactionFormErrors; valid: ValidTransactionForm | null } {
  const errors: TransactionFormErrors = {};
  const wallet = context.wallets.find((candidate) => candidate.id === values.walletId);
  if (!wallet) errors.wallet = 'Choose a wallet.';
  const amount = parseAmountInput(values.amount, {
    currency: wallet?.currency ?? context.fallbackCurrency,
    locale: context.locale,
    positive: true,
  });
  if (amount.error) errors.amount = amount.error;
  if (!values.categoryId) errors.category = 'Choose a category.';
  if (!isValidLocalDate(values.date)) errors.date = 'Enter a valid date.';
  const note = values.note.trim();
  if (note.length > NOTE_MAX_LENGTH) errors.note = 'Keep notes under 500 characters.';
  else if (hasForbiddenNoteChars(note)) errors.note = 'Remove special characters from the note.';
  if (Object.keys(errors).length > 0 || !wallet || amount.minor === null || !values.categoryId) {
    return { errors, valid: null };
  }
  return {
    errors,
    valid: {
      type: values.type,
      walletId: wallet.id,
      categoryId: values.categoryId,
      amountMinor: amount.minor,
      occurredOn: values.date,
      note: note === '' ? null : note,
    },
  };
}

export const toCreateTransaction = (form: ValidTransactionForm): CreateTransactionRequest => ({
  ...form,
});

/** Only the fields that changed; a changed type always carries the (matching) category. */
export function toUpdateTransaction(
  form: ValidTransactionForm,
  original: Transaction,
): UpdateTransactionRequest {
  const patch: UpdateTransactionRequest = {};
  if (form.type !== original.type) patch.type = form.type;
  if (form.walletId !== original.wallet.id) patch.walletId = form.walletId;
  if (form.categoryId !== original.category?.id || form.type !== original.type) {
    patch.categoryId = form.categoryId;
  }
  if (form.amountMinor !== original.amountMinor) patch.amountMinor = form.amountMinor;
  if (form.occurredOn !== original.occurredOn) patch.occurredOn = form.occurredOn;
  if (form.note !== original.note) patch.note = form.note;
  return patch;
}

import type {
  CreateWalletRequest,
  CurrencyCode,
  UpdateWalletRequest,
  Wallet,
  WalletType,
} from '@midas/shared';
import { WALLET_NAME_MAX_LENGTH } from '@midas/shared/wallets';
import { parseAmountInput } from '@/lib/money-input';
import { toEditableAmount } from '@/lib/money';

export interface WalletFormValues {
  name: string;
  type: WalletType | null;
  currency: string;
  opening: string;
}

export type WalletFormField = keyof WalletFormValues;
export type WalletFormErrors = Partial<Record<WalletFormField, string>>;

const FORBIDDEN_NAME_CHARS = /[\p{Cc}\p{Cf}]/u;

export function initialValues(
  wallet: Wallet | undefined,
  defaults: { currency: string; locale: string },
): WalletFormValues {
  if (!wallet) return { name: '', type: null, currency: defaults.currency, opening: '' };
  return {
    name: wallet.name,
    type: wallet.type,
    currency: wallet.currency,
    opening: toEditableAmount(wallet.openingBalanceMinor, wallet.currency, defaults.locale),
  };
}

export function isDirty(values: WalletFormValues, initial: WalletFormValues): boolean {
  return (
    values.name.trim() !== initial.name.trim() ||
    values.type !== initial.type ||
    values.currency !== initial.currency ||
    values.opening.trim() !== initial.opening.trim()
  );
}

export interface ValidWalletForm {
  name: string;
  type: WalletType;
  currency: string;
  openingBalanceMinor: number;
}

export function validateWalletForm(
  values: WalletFormValues,
  locale: string,
): { errors: WalletFormErrors; valid: ValidWalletForm | null } {
  const errors: WalletFormErrors = {};
  const name = values.name.trim();
  if (!name) errors.name = 'Enter a name.';
  else if (name.length > WALLET_NAME_MAX_LENGTH) {
    errors.name = `Use ${WALLET_NAME_MAX_LENGTH} characters or fewer.`;
  } else if (FORBIDDEN_NAME_CHARS.test(name))
    errors.name = 'Remove special or invisible characters.';
  if (!values.type) errors.type = 'Choose a type.';
  if (!values.currency) errors.currency = 'Choose a currency.';
  const opening = parseAmountInput(values.opening, {
    currency: values.currency || 'USD',
    locale,
    allowNegative: true,
  });
  if (opening.error) errors.opening = opening.error;
  if (Object.keys(errors).length > 0 || !values.type) return { errors, valid: null };
  return {
    errors,
    valid: {
      name,
      type: values.type,
      currency: values.currency,
      openingBalanceMinor: opening.minor ?? 0,
    },
  };
}

export function toCreateRequest(form: ValidWalletForm): CreateWalletRequest {
  return { ...form, currency: form.currency as CurrencyCode };
}

/** Sends only what changed; currency is left out when it did not change (it may be locked). */
export function toUpdateRequest(form: ValidWalletForm, wallet: Wallet): UpdateWalletRequest {
  const patch: UpdateWalletRequest = {};
  if (form.name !== wallet.name) patch.name = form.name;
  if (form.type !== wallet.type) patch.type = form.type;
  if (form.currency !== wallet.currency) patch.currency = form.currency as CurrencyCode;
  if (form.openingBalanceMinor !== wallet.openingBalanceMinor) {
    patch.openingBalanceMinor = form.openingBalanceMinor;
  }
  return patch;
}

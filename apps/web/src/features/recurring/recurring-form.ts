import type {
  CreateRecurringTemplateRequest,
  RecurringFrequency,
  RecurringTemplate,
  RecurringType,
  UpdateRecurringTemplateRequest,
} from '@midas/shared';
import { NOTE_MAX_LENGTH, isValidLocalDate } from '@midas/shared/money';
import {
  RECURRING_INTERVAL_MAX,
  RECURRING_MAX_BACKDATE_DAYS,
  RECURRING_NAME_MAX_LENGTH,
} from '@midas/shared/recurring';
import { addDays } from '@/lib/dates';
import { parseAmountInput } from '@/lib/money-input';

export interface RecurringFormValues {
  type: RecurringType;
  name: string;
  amount: string;
  walletId: string;
  categoryId: string;
  note: string;
  frequency: RecurringFrequency;
  /** As typed. */
  interval: string;
  startDate: string;
  endMode: 'never' | 'on';
  endDate: string;
}

export type RecurringFormField =
  'name' | 'amount' | 'walletId' | 'categoryId' | 'note' | 'interval' | 'startDate' | 'endDate';
export type RecurringFormErrors = Partial<Record<RecurringFormField, string>>;

export function emptyRecurringForm(today: string): RecurringFormValues {
  return {
    type: 'expense',
    name: '',
    amount: '',
    walletId: '',
    categoryId: '',
    note: '',
    frequency: 'monthly',
    interval: '1',
    startDate: today,
    endMode: 'never',
    endDate: '',
  };
}

const FORBIDDEN = /[\p{Cc}\p{Cf}]/u;

export function parseInterval(text: string): number | null {
  if (!/^\d{1,3}$/.test(text.trim())) return null;
  const value = Number(text.trim());
  return value >= 1 && value <= RECURRING_INTERVAL_MAX ? value : null;
}

export interface RecurringValidation {
  errors: RecurringFormErrors;
  amountMinor: number | null;
  interval: number | null;
}

export interface RecurringContext {
  locale: string;
  /** The wallet's currency (money format and decimals). */
  currency: string;
  today: string;
  /** Creating limits the start to 31 days back; editing keeps the stored start. */
  mode: 'create' | 'edit';
}

function validateSchedule(
  values: RecurringFormValues,
  ctx: RecurringContext,
  errors: RecurringFormErrors,
): void {
  if (!isValidLocalDate(values.startDate)) {
    errors.startDate = 'Enter a valid start date.';
  } else if (
    ctx.mode === 'create' &&
    values.startDate < addDays(ctx.today, -RECURRING_MAX_BACKDATE_DAYS)
  ) {
    errors.startDate = `The start date can be at most ${RECURRING_MAX_BACKDATE_DAYS} days in the past.`;
  }
  if (values.endMode === 'on') {
    if (!isValidLocalDate(values.endDate)) errors.endDate = 'Enter a valid end date.';
    else if (!errors.startDate && values.endDate < values.startDate) {
      errors.endDate = 'The end date must not be before the start date.';
    }
  }
}

export function validateRecurringForm(
  values: RecurringFormValues,
  ctx: RecurringContext,
): RecurringValidation {
  const errors: RecurringFormErrors = {};
  const name = values.name.trim();
  if (!name) errors.name = 'Enter a name.';
  else if (name.length > RECURRING_NAME_MAX_LENGTH) {
    errors.name = `Use ${RECURRING_NAME_MAX_LENGTH} characters or fewer.`;
  } else if (FORBIDDEN.test(name)) errors.name = 'Remove special or invisible characters.';

  const amount = parseAmountInput(values.amount, {
    currency: ctx.currency,
    locale: ctx.locale,
    positive: true,
  });
  if (amount.error) errors.amount = amount.error;
  if (!values.walletId) errors.walletId = 'Choose a wallet.';
  if (!values.categoryId) errors.categoryId = 'Choose a category.';
  if (values.note.trim().length > NOTE_MAX_LENGTH) {
    errors.note = `Use ${NOTE_MAX_LENGTH} characters or fewer.`;
  }
  const interval = parseInterval(values.interval);
  if (interval === null) {
    errors.interval = `Enter a whole number from 1 to ${RECURRING_INTERVAL_MAX}.`;
  }
  validateSchedule(values, ctx, errors);
  return { errors, amountMinor: amount.minor, interval };
}

export function toCreateRequest(
  values: RecurringFormValues,
  amountMinor: number,
  interval: number,
): CreateRecurringTemplateRequest {
  const note = values.note.trim();
  return {
    name: values.name.trim(),
    type: values.type,
    walletId: values.walletId,
    categoryId: values.categoryId,
    amountMinor,
    ...(note ? { note } : {}),
    frequency: values.frequency,
    interval,
    startDate: values.startDate,
    ...(values.endMode === 'on' ? { endDate: values.endDate } : {}),
  };
}

/** Only changed fields; `type` cannot change. Clearing the end sends null. */
export function toUpdateRequest(
  template: RecurringTemplate,
  values: RecurringFormValues,
  amountMinor: number,
  interval: number,
): UpdateRecurringTemplateRequest {
  const name = values.name.trim();
  const note = values.note.trim() || null;
  const endDate = values.endMode === 'on' ? values.endDate : null;
  return {
    ...(name !== template.name ? { name } : {}),
    ...(values.walletId !== template.wallet.id ? { walletId: values.walletId } : {}),
    ...(values.categoryId !== template.category.id ? { categoryId: values.categoryId } : {}),
    ...(amountMinor !== template.amountMinor ? { amountMinor } : {}),
    ...(note !== template.note ? { note } : {}),
    ...(values.frequency !== template.frequency ? { frequency: values.frequency } : {}),
    ...(interval !== template.interval ? { interval } : {}),
    ...(values.startDate !== template.startDate ? { startDate: values.startDate } : {}),
    ...(endDate !== template.endDate ? { endDate } : {}),
  };
}

import type {
  Budget,
  BudgetPeriod,
  BudgetScope,
  CreateBudgetRequest,
  CurrencyCode,
  UpdateBudgetRequest,
} from '@midas/shared';
import { WARNING_THRESHOLD_MAX, WARNING_THRESHOLD_MIN } from '@midas/shared/budgets';
import { DEFAULT_WARNING_THRESHOLD_PCT } from '@midas/shared/budget-math';
import { parseAmountInput } from '@/lib/money-input';

export interface BudgetFormValues {
  scope: BudgetScope;
  categoryId: string;
  period: BudgetPeriod;
  /** What the user typed. */
  amount: string;
  currency: string;
  /** Percent as typed (the number input and the slider share it). */
  threshold: string;
}

export type BudgetFormField = 'categoryId' | 'amount' | 'threshold';
export type BudgetFormErrors = Partial<Record<BudgetFormField, string>>;

export function emptyBudgetForm(currency: string): BudgetFormValues {
  return {
    scope: 'overall',
    categoryId: '',
    period: 'monthly',
    amount: '',
    currency,
    threshold: String(DEFAULT_WARNING_THRESHOLD_PCT),
  };
}

/** The threshold as an integer, or null when the text is not a whole number in range. */
export function parseThreshold(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,3}$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= WARNING_THRESHOLD_MIN && value <= WARNING_THRESHOLD_MAX ? value : null;
}

export interface ValidationContext {
  locale: string;
}

export interface ValidatedBudget {
  errors: BudgetFormErrors;
  amountMinor: number | null;
  threshold: number | null;
}

export function validateBudgetForm(
  values: BudgetFormValues,
  { locale }: ValidationContext,
): ValidatedBudget {
  const errors: BudgetFormErrors = {};
  if (values.scope === 'category' && !values.categoryId) {
    errors.categoryId = 'Choose a category.';
  }
  const amount = parseAmountInput(values.amount, {
    currency: values.currency as CurrencyCode,
    locale,
    positive: true,
  });
  if (amount.error) errors.amount = amount.error;
  const threshold = parseThreshold(values.threshold);
  if (threshold === null) {
    errors.threshold = `Enter a whole number from ${WARNING_THRESHOLD_MIN} to ${WARNING_THRESHOLD_MAX}.`;
  }
  return { errors, amountMinor: amount.minor, threshold };
}

export function toCreateRequest(
  values: BudgetFormValues,
  amountMinor: number,
  threshold: number,
): CreateBudgetRequest {
  return {
    scope: values.scope,
    ...(values.scope === 'category' ? { categoryId: values.categoryId } : {}),
    period: values.period,
    amountMinor,
    currency: values.currency as CurrencyCode,
    warningThresholdPct: threshold,
  };
}

/** Only the changed fields: scope, category, period and currency are fixed after creation. */
export function toUpdateRequest(
  budget: Pick<Budget, 'amountMinor' | 'warningThresholdPct'>,
  amountMinor: number,
  threshold: number,
): UpdateBudgetRequest {
  return {
    ...(amountMinor !== budget.amountMinor ? { amountMinor } : {}),
    ...(threshold !== budget.warningThresholdPct ? { warningThresholdPct: threshold } : {}),
  };
}

import type { Budget, BudgetStatus, CurrencyCode } from '@midas/shared';
import { WARNING_THRESHOLD_MAX, WARNING_THRESHOLD_MIN } from '@midas/shared/budgets';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useBreakpoint } from '@/app/shell/use-breakpoint';
import { BudgetMeter } from '@/components/domain/budget-meter';
import { MoneyField } from '@/components/domain/money-field';
import { Alert } from '@/components/ui/alert';
import { ApiErrorAlert } from '@/components/ui/api-error-alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ErrorSummary, type SummaryError } from '@/components/ui/error-summary';
import { FieldFrame, NativeSelect } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { useCategories } from '@/features/categories/api';
import { useWallets } from '@/features/wallets/api';
import { todayLocalDate } from '@/lib/dates';
import { focusFirstInvalid } from '@/lib/focus';
import { formatMinor, toEditableAmount } from '@/lib/money';
import { applyProblemToForm } from '@/lib/problem-form';
import { usePreferences } from '@/lib/preferences';
import { createBudget, updateBudget, useInvalidateBudgets } from './api';
import {
  emptyBudgetForm,
  parseThreshold,
  toCreateRequest,
  toUpdateRequest,
  validateBudgetForm,
  type BudgetFormErrors,
  type BudgetFormValues,
} from './budget-form';
import { PERIOD_LABELS, paceOf, periodBounds } from './budget-state';

const SCOPE_OPTIONS = [
  { value: 'overall', label: 'Everything' },
  { value: 'category', label: 'One category' },
] as const;

const PERIOD_OPTIONS = (['monthly', 'weekly', 'yearly'] as const).map((value) => ({
  value,
  label: PERIOD_LABELS[value],
}));

export interface BudgetFormDialogProps {
  mode: 'create' | 'edit';
  budget?: Budget;
  /** Budgets already loaded: categories that have one for the chosen period are disabled. */
  existing: readonly Budget[];
  onClose: () => void;
  onSaved: (budget: Budget) => void;
  /** The budget no longer exists (404). */
  onGone: () => void;
  onCloseAutoFocus?: (event: Event) => void;
}

/** A synthetic budget sitting exactly at the warning threshold, for the live preview. */
function previewBudget(
  amountMinor: number,
  threshold: number,
  values: BudgetFormValues,
  today: string,
): Budget {
  const bounds = periodBounds(values.period, today);
  const spentMinor = Math.floor((amountMinor * threshold) / 100);
  const status: BudgetStatus = {
    periodStart: bounds.start,
    periodEnd: bounds.end,
    spentMinor,
    remainingMinor: amountMinor - spentMinor,
    percentUsed: threshold,
    state: 'warning',
  };
  return {
    id: 'preview',
    scope: values.scope,
    category: null,
    period: values.period,
    amountMinor,
    currency: values.currency as CurrencyCode,
    warningThresholdPct: threshold,
    startDate: bounds.start,
    status,
    createdAt: today,
    updatedAt: today,
  };
}

export function BudgetFormDialog(props: BudgetFormDialogProps) {
  const { mode, budget, existing, onClose, onSaved, onGone, onCloseAutoFocus } = props;
  const breakpoint = useBreakpoint();
  const { currency: preferred, locale, timezone } = usePreferences();
  const invalidate = useInvalidateBudgets();
  const wallets = useWallets();
  const categories = useCategories();
  const formRef = useRef<HTMLFormElement>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  const today = todayLocalDate(timezone);

  const initial = useMemo<BudgetFormValues>(() => {
    if (budget) {
      return {
        scope: budget.scope,
        categoryId: budget.category?.id ?? '',
        period: budget.period,
        amount: toEditableAmount(budget.amountMinor, budget.currency, locale),
        currency: budget.currency,
        threshold: String(budget.warningThresholdPct),
      };
    }
    return emptyBudgetForm(preferred);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [values, setValues] = useState<BudgetFormValues>(initial);
  const [errors, setErrors] = useState<BudgetFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [exists, setExists] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const dirty = (Object.keys(initial) as Array<keyof BudgetFormValues>).some(
    (key) => values[key].trim() !== initial[key].trim(),
  );

  useEffect(() => {
    if (attempt > 0) focusFirstInvalid(formRef.current);
  }, [attempt]);

  const set = <K extends keyof BudgetFormValues>(key: K, value: BudgetFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key === 'amount' ? 'amount' : key]: undefined }));
    setExists(false);
  };
  const requestClose = () => {
    if (dirty && !pending) setConfirmDiscard(true);
    else onClose();
  };

  const currencies = useMemo(() => {
    const codes = new Set<string>([preferred]);
    for (const wallet of wallets.data ?? []) if (!wallet.archived) codes.add(wallet.currency);
    return [...codes].sort();
  }, [wallets.data, preferred]);

  const expenseCategories = useMemo(
    () => (categories.data ?? []).filter((c) => c.type === 'expense' && !c.retired),
    [categories.data],
  );
  const taken = useMemo(
    () =>
      new Set(
        existing
          .filter(
            (b) =>
              b.scope === 'category' &&
              b.period === values.period &&
              b.currency === values.currency,
          )
          .map((b) => b.category?.id ?? ''),
      ),
    [existing, values.period, values.currency],
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending || (mode === 'edit' && !dirty)) return;
    const result = validateBudgetForm(values, { locale });
    setErrors(result.errors);
    setFormError(null);
    setExists(false);
    setFailure(null);
    if (
      Object.keys(result.errors).length > 0 ||
      result.amountMinor === null ||
      result.threshold === null
    ) {
      setAttempt((count) => count + 1);
      return;
    }
    // Compare normalised values: "50.00" vs "50" is not a change, so it sends no request.
    const patch =
      mode === 'edit' && budget
        ? toUpdateRequest(budget, result.amountMinor, result.threshold)
        : null;
    if (patch && Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    setPending(true);
    try {
      const saved =
        mode === 'edit' && budget && patch
          ? await updateBudget(budget.id, patch)
          : await createBudget(toCreateRequest(values, result.amountMinor, result.threshold));
      await invalidate();
      onSaved(saved);
    } catch (caught) {
      const mapped = applyProblemToForm(caught, {
        fieldMap: {
          categoryId: 'categoryId',
          amountMinor: 'amount',
          warningThresholdPct: 'threshold',
        },
        codeRules: {
          CATEGORY_RETIRED: {
            field: 'categoryId',
            message: 'That category was retired. Choose another.',
          },
          CATEGORY_TYPE_MISMATCH: {
            field: 'categoryId',
            message: 'Budgets apply to expense categories.',
          },
          INVALID_REFERENCE: { field: 'categoryId', message: 'That category is not available.' },
          LIMIT_REACHED: { message: "You've reached the limit of 200 budgets." },
        },
      });
      if (mapped.code === 'NOT_FOUND') return onGone();
      if (mapped.code === 'BUDGET_EXISTS') {
        setExists(true);
        setAttempt((count) => count + 1);
      } else if (Object.keys(mapped.fields).length > 0) {
        setErrors(mapped.fields as BudgetFormErrors);
        setAttempt((count) => count + 1);
      } else if (mapped.status && mapped.status > 0 && mapped.status < 500) {
        setFormError(mapped.form);
      } else {
        setFailure(caught);
      }
    } finally {
      setPending(false);
    }
  }

  const threshold = parseThreshold(values.threshold);
  const limitMinor = validateBudgetForm(values, { locale }).amountMinor;
  const previewLimit = limitMinor ?? 100_000;
  const thresholdMinor = threshold === null ? null : Math.floor((previewLimit * threshold) / 100);
  const summary: SummaryError[] = [
    ...(errors.categoryId
      ? [{ id: 'budget-category', label: 'Category', message: errors.categoryId }]
      : []),
    ...(errors.amount ? [{ id: 'budget-amount', label: 'Limit', message: errors.amount }] : []),
    ...(errors.threshold
      ? [{ id: 'budget-threshold', label: 'Warn me at', message: errors.threshold }]
      : []),
  ];
  const categoryOptions = [
    { value: '', label: 'Choose a category' },
    ...expenseCategories.map((c) => ({
      value: c.id,
      label:
        taken.has(c.id) && c.id !== initial.categoryId
          ? `${c.name} (Already has a budget)`
          : c.name,
      disabled: taken.has(c.id) && c.id !== initial.categoryId,
    })),
  ];
  const existsMessage =
    values.scope === 'category'
      ? 'You already have a budget for this category and period.'
      : 'You already have an overall budget for this period and currency.';

  const preview =
    thresholdMinor !== null && threshold !== null ? (
      <div className="flex flex-col gap-1" data-testid="budget-preview">
        <span className="text-body-sm font-medium text-ink-2">Preview</span>
        <BudgetMeter
          budget={previewBudget(previewLimit, threshold, values, today)}
          pace={paceOf(previewBudget(previewLimit, threshold, values, today).status, today)}
          label="Warning threshold preview"
        />
        <p className="text-body-sm text-ink-3">
          {threshold}% = {formatMinor(thresholdMinor, values.currency, locale)} and over shows
          &quot;Near limit&quot;.
        </p>
      </div>
    ) : null;

  const scopeFields =
    mode === 'create' ? (
      <>
        <Segmented
          legend="Applies to"
          legendHidden={false}
          options={SCOPE_OPTIONS}
          value={values.scope}
          onChange={(scope) => set('scope', scope)}
        />
        {values.scope === 'category' ? (
          <FieldFrame
            id="budget-category"
            label="Category"
            required
            error={errors.categoryId ?? (exists ? existsMessage : undefined)}
            helper="Expense categories only."
          >
            {(control) => (
              <NativeSelect
                {...control}
                value={values.categoryId}
                onChange={(value) => set('categoryId', value)}
                options={categoryOptions}
                invalid={control['aria-invalid'] === true}
              />
            )}
          </FieldFrame>
        ) : null}
        <FieldFrame id="budget-period" label="Repeats">
          {(control) => (
            <NativeSelect
              {...control}
              value={values.period}
              onChange={(value) => set('period', value as BudgetFormValues['period'])}
              options={PERIOD_OPTIONS}
            />
          )}
        </FieldFrame>
        {currencies.length > 1 ? (
          <FieldFrame id="budget-currency" label="Currency">
            {(control) => (
              <NativeSelect
                {...control}
                value={values.currency}
                onChange={(value) => set('currency', value)}
                options={currencies.map((code) => ({ value: code, label: code }))}
              />
            )}
          </FieldFrame>
        ) : null}
      </>
    ) : (
      <>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body-sm">
          <dt className="text-ink-3">Applies to</dt>
          <dd>{budget?.scope === 'overall' ? 'Everything' : budget?.category?.name}</dd>
          <dt className="text-ink-3">Repeats</dt>
          <dd>{PERIOD_LABELS[values.period]}</dd>
          <dt className="text-ink-3">Currency</dt>
          <dd>{values.currency}</dd>
        </dl>
        <p className="text-body-sm text-ink-3">
          To change these, delete the budget and create a new one.
        </p>
      </>
    );

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && requestClose()}>
        <DialogContent
          title={mode === 'create' ? 'Create budget' : 'Edit budget'}
          variant={breakpoint === 'mobile' ? 'sheet' : 'dialog'}
          className="sm:max-w-[32.5rem]"
          {...(onCloseAutoFocus ? { onCloseAutoFocus } : {})}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            firstRef.current?.focus();
          }}
        >
          <form
            ref={formRef}
            noValidate
            onSubmit={(event) => void onSubmit(event)}
            className="flex flex-col gap-4"
          >
            <ErrorSummary errors={summary} />
            {formError ? <Alert variant="danger">{formError}</Alert> : null}
            {failure ? <ApiErrorAlert error={failure} /> : null}
            {exists && values.scope === 'overall' ? (
              <Alert variant="danger">{existsMessage}</Alert>
            ) : null}
            {scopeFields}
            <FieldFrame id="budget-amount" label="Limit" required error={errors.amount}>
              {(control) => (
                <MoneyField
                  {...control}
                  ref={firstRef}
                  name="amount"
                  currency={values.currency}
                  value={values.amount}
                  onChange={(value) => set('amount', value)}
                />
              )}
            </FieldFrame>
            <div className="flex flex-col gap-2">
              <FieldFrame
                id="budget-threshold"
                label="Warn me at (percent)"
                error={errors.threshold}
                helper="You will see a warning once spending reaches this share of the limit."
              >
                {(control) => (
                  <Input
                    {...control}
                    name="threshold"
                    inputMode="numeric"
                    autoComplete="off"
                    className="w-24"
                    value={values.threshold}
                    onChange={(event) => set('threshold', event.target.value)}
                    invalid={control['aria-invalid'] === true}
                  />
                )}
              </FieldFrame>
              <input
                type="range"
                aria-label="Warning threshold slider"
                min={WARNING_THRESHOLD_MIN}
                max={WARNING_THRESHOLD_MAX}
                step={1}
                value={threshold ?? 80}
                aria-valuetext={
                  threshold !== null && thresholdMinor !== null
                    ? `${threshold} percent, ${formatMinor(thresholdMinor, values.currency, locale)}`
                    : undefined
                }
                onChange={(event) => set('threshold', event.target.value)}
                className="w-full accent-primary pointer-coarse:h-11"
              />
            </div>
            {preview}
            {mode === 'edit' ? (
              <p className="text-body-sm text-ink-3">
                Changing the limit also changes how past periods look.
              </p>
            ) : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
              {mode === 'edit' && !dirty ? (
                <p id="budget-no-changes" className="text-body-sm text-ink-3 sm:mr-auto">
                  No changes to save.
                </p>
              ) : null}
              <Button variant="secondary" onClick={requestClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                loading={pending}
                aria-disabled={(mode === 'edit' && !dirty) || undefined}
                aria-describedby={mode === 'edit' && !dirty ? 'budget-no-changes' : undefined}
              >
                {mode === 'create' ? 'Create budget' : 'Save changes'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard this budget?"
        consequences={['Your changes will be lost.']}
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        onConfirm={() => {
          setConfirmDiscard(false);
          onClose();
        }}
      />
    </>
  );
}

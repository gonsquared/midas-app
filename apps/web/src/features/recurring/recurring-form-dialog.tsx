import type { RecurringTemplate, Wallet } from '@midas/shared';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useBreakpoint } from '@/app/shell/use-breakpoint';
import { Alert } from '@/components/ui/alert';
import { ApiErrorAlert } from '@/components/ui/api-error-alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ErrorSummary, type SummaryError } from '@/components/ui/error-summary';
import { useCategories } from '@/features/categories/api';
import { useWallets } from '@/features/wallets/api';
import { todayLocalDate } from '@/lib/dates';
import { focusFirstInvalid } from '@/lib/focus';
import { toEditableAmount } from '@/lib/money';
import { applyProblemToForm } from '@/lib/problem-form';
import { usePreferences } from '@/lib/preferences';
import { createTemplate, updateTemplate, useInvalidateRecurring } from './api';
import {
  emptyRecurringForm,
  parseInterval,
  toCreateRequest,
  toUpdateRequest,
  validateRecurringForm,
  type RecurringFormErrors,
  type RecurringFormValues,
} from './recurring-form';
import { RecurringFields } from './recurring-fields';
import { useSchedulePreview } from './use-schedule-preview';

export interface RecurringFormDialogProps {
  mode: 'create' | 'edit';
  template?: RecurringTemplate;
  onClose: () => void;
  onSaved: (template: RecurringTemplate) => void;
  onGone: () => void;
  onCloseAutoFocus?: (event: Event) => void;
}

function initialValues(
  template: RecurringTemplate | undefined,
  today: string,
  locale: string,
): RecurringFormValues {
  if (!template) return emptyRecurringForm(today);
  return {
    type: template.type,
    name: template.name,
    amount: toEditableAmount(template.amountMinor, template.currency, locale),
    walletId: template.wallet.id,
    categoryId: template.category.id,
    note: template.note ?? '',
    frequency: template.frequency,
    interval: String(template.interval),
    startDate: template.startDate,
    endMode: template.endDate ? 'on' : 'never',
    endDate: template.endDate ?? '',
  };
}

const FIELD_MAP = {
  name: 'name',
  amountMinor: 'amount',
  walletId: 'walletId',
  categoryId: 'categoryId',
  note: 'note',
  interval: 'interval',
  frequency: 'interval',
  startDate: 'startDate',
  endDate: 'endDate',
};

const CODE_RULES = {
  WALLET_ARCHIVED: {
    field: 'walletId',
    message: 'That wallet is archived. Choose another, or unarchive it first.',
  },
  CATEGORY_RETIRED: { field: 'categoryId', message: 'That category was retired. Choose another.' },
  CATEGORY_TYPE_MISMATCH: { field: 'categoryId', message: 'Choose a category of the same type.' },
  INVALID_REFERENCE: { field: 'walletId', message: 'That wallet or category is not available.' },
  LIMIT_REACHED: { message: "You've reached the limit of 200 recurring transactions." },
  TEMPLATE_ENDED: { message: "This recurring transaction has ended and can't be changed." },
};

export function RecurringFormDialog(props: RecurringFormDialogProps) {
  const { mode, template, onClose, onSaved, onGone, onCloseAutoFocus } = props;
  const breakpoint = useBreakpoint();
  const { locale, timezone } = usePreferences();
  const today = todayLocalDate(timezone);
  const invalidate = useInvalidateRecurring();
  const wallets = useWallets();
  const categories = useCategories({ includeRetired: mode === 'edit' });
  const formRef = useRef<HTMLFormElement>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initial = useMemo(() => initialValues(template, today, locale), []);
  const [values, setValues] = useState<RecurringFormValues>(initial);
  const [errors, setErrors] = useState<RecurringFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const dirty = (Object.keys(initial) as Array<keyof RecurringFormValues>).some(
    (key) => String(values[key]).trim() !== String(initial[key]).trim(),
  );
  useEffect(() => {
    if (attempt > 0) focusFirstInvalid(formRef.current);
  }, [attempt]);

  const walletList: Wallet[] = useMemo(
    () => (wallets.data ?? []).filter((w) => !w.archived || w.id === initial.walletId),
    [wallets.data, initial.walletId],
  );
  const wallet = walletList.find((w) => w.id === values.walletId);
  const currency = wallet?.currency ?? template?.currency ?? 'USD';
  const ctx = { locale, currency, today, mode } as const;

  const set = <K extends keyof RecurringFormValues>(key: K, value: RecurringFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };
  const requestClose = () => {
    if (dirty && !pending) setConfirmDiscard(true);
    else onClose();
  };

  const check = validateRecurringForm(values, ctx);
  const scheduleValid = !check.errors.startDate && !check.errors.endDate && check.interval !== null;
  const preview = useSchedulePreview(
    {
      frequency: values.frequency,
      interval: parseInterval(values.interval),
      startDate: values.startDate,
      endDate: values.endMode === 'on' ? values.endDate : null,
      valid: scheduleValid,
    },
    today,
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending || (mode === 'edit' && !dirty)) return;
    const result = validateRecurringForm(values, ctx);
    setErrors(result.errors);
    setFormError(null);
    setFailure(null);
    if (
      Object.keys(result.errors).length > 0 ||
      result.amountMinor === null ||
      result.interval === null
    ) {
      setAttempt((count) => count + 1);
      return;
    }
    setPending(true);
    try {
      const saved =
        mode === 'edit' && template
          ? await updateTemplate(
              template.id,
              toUpdateRequest(template, values, result.amountMinor, result.interval),
            )
          : await createTemplate(toCreateRequest(values, result.amountMinor, result.interval));
      await invalidate({ ledger: mode === 'create' });
      onSaved(saved);
    } catch (caught) {
      const mapped = applyProblemToForm(caught, { fieldMap: FIELD_MAP, codeRules: CODE_RULES });
      if (mapped.code === 'NOT_FOUND') return onGone();
      setErrors(mapped.fields as RecurringFormErrors);
      if (Object.keys(mapped.fields).length > 0) setAttempt((count) => count + 1);
      else if (mapped.status && mapped.status > 0 && mapped.status < 500) setFormError(mapped.form);
      else setFailure(caught);
    } finally {
      setPending(false);
    }
  }

  const summary: SummaryError[] = (
    [
      ['name', 'recurring-name', 'Name'],
      ['amount', 'recurring-amount', 'Amount'],
      ['walletId', 'recurring-wallet', 'Wallet'],
      ['categoryId', 'recurring-category', 'Category'],
      ['interval', 'recurring-interval', 'Repeats every'],
      ['startDate', 'recurring-start', 'Starts'],
      ['endDate', 'recurring-end', 'Ends'],
      ['note', 'recurring-note', 'Note'],
    ] as const
  ).flatMap(([field, id, label]) =>
    errors[field] ? [{ id, label, message: errors[field] as string }] : [],
  );

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && requestClose()}>
        <DialogContent
          title={mode === 'create' ? 'Create recurring transaction' : 'Edit recurring transaction'}
          variant={breakpoint === 'mobile' ? 'sheet' : 'dialog'}
          className="sm:max-w-[35rem]"
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
            <RecurringFields
              mode={mode}
              values={values}
              errors={errors}
              set={set}
              currency={currency}
              wallets={walletList}
              categories={categories.data ?? []}
              today={today}
              locale={locale}
              preview={preview}
              firstRef={firstRef}
              initialCategoryId={initial.categoryId}
            />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
              {mode === 'edit' && !dirty ? (
                <p id="recurring-no-changes" className="text-body-sm text-ink-3 sm:mr-auto">
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
                aria-describedby={mode === 'edit' && !dirty ? 'recurring-no-changes' : undefined}
              >
                {mode === 'create' ? 'Create recurring' : 'Save changes'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard this recurring transaction?"
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

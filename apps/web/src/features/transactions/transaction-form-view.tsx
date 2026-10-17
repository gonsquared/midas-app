import type { Category, Transaction, Wallet } from '@midas/shared';
import { NOTE_MAX_LENGTH } from '@midas/shared/money';
import { Link } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { DateField } from '@/components/domain/date-field';
import { MoneyField } from '@/components/domain/money-field';
import { Alert } from '@/components/ui/alert';
import { useAnnounce } from '@/components/ui/announcer';
import { ApiErrorAlert } from '@/components/ui/api-error-alert';
import { Button } from '@/components/ui/button';
import { ErrorSummary, type SummaryError } from '@/components/ui/error-summary';
import { FieldFrame, Textarea } from '@/components/ui/form-field';
import { cn } from '@/lib/cn';
import { toEditableAmount, formatMinor } from '@/lib/money';
import { todayLocalDate } from '@/lib/dates';
import { focusFirstInvalid } from '@/lib/focus';
import { usePreferences } from '@/lib/preferences';
import { applyProblemToForm } from '@/lib/problem-form';
import { useSession } from '@/lib/session';
import { useInvalidateWallets } from '@/features/wallets/api';
import { useInvalidateCategories } from '@/features/categories/api';
import { createTransaction, updateTransaction, useInvalidateLedger } from './api';
import type { ComposerPrefill } from './composer-store';
import { defaultWalletId, storeLastWallet } from './last-wallet';
import { CategoryCombobox, RecentCategoryChips, WalletCombobox, recentCategories } from './pickers';
import {
  TRANSACTION_FIELD_MAP,
  toCreateTransaction,
  toUpdateTransaction,
  validateTransactionForm,
  type EditableType,
  type TransactionFormErrors,
  type TransactionFormField,
  type TransactionFormValues,
} from './transaction-form';

export interface TransactionDraft {
  amount: string;
  walletId: string | null;
  date: string;
  note: string;
}

export interface TransactionFormProps {
  layout: 'drawer' | 'bar';
  type: EditableType;
  wallets: readonly Wallet[];
  categories: readonly Category[];
  recent: readonly Transaction[] | undefined;
  transaction?: Transaction | undefined;
  prefill?: ComposerPrefill | null | undefined;
  draft?: TransactionDraft | undefined;
  onDraftChange?: (draft: TransactionDraft) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onSaved: (saved: Transaction) => void;
  onCancel?: () => void;
  onDelete?: () => void;
  /** A stale link opened a transfer leg as a plain transaction. */
  onTransferLeg?: () => void;
  onGone?: () => void;
}

const FIELD_LABELS: Record<TransactionFormField, string> = {
  amount: 'Amount',
  category: 'Category',
  wallet: 'Wallet',
  date: 'Date',
  note: 'Note',
};

export function TransactionForm(props: TransactionFormProps) {
  const { layout, type, wallets, categories, recent, transaction, onSaved } = props;
  const prefs = usePreferences();
  const { user } = useSession();
  const announce = useAnnounce();
  const invalidateLedger = useInvalidateLedger();
  const invalidateWallets = useInvalidateWallets();
  const invalidateCategories = useInvalidateCategories();
  const formRef = useRef<HTMLFormElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const editing = Boolean(transaction);
  const today = todayLocalDate(prefs.timezone);
  const activeWallets = useMemo(() => wallets.filter((wallet) => !wallet.archived), [wallets]);

  const initial = useMemo<TransactionFormValues>(() => {
    if (transaction) {
      return {
        type,
        amount: toEditableAmount(transaction.amountMinor, transaction.currency, prefs.locale),
        categoryId: transaction.category?.id ?? null,
        walletId: transaction.wallet.id,
        date: transaction.occurredOn,
        note: transaction.note ?? '',
      };
    }
    const { draft, prefill } = props;
    return {
      type,
      amount:
        draft?.amount ??
        (prefill?.amountMinor !== undefined
          ? toEditableAmount(
              prefill.amountMinor,
              wallets.find((w) => w.id === prefill.walletId)?.currency ?? prefs.currency,
              prefs.locale,
            )
          : ''),
      categoryId: prefill?.categoryId ?? null,
      walletId: draft?.walletId ?? prefill?.walletId ?? defaultWalletId(wallets, user?.id),
      date: draft?.date ?? prefill?.occurredOn ?? today,
      note: draft?.note ?? prefill?.note ?? '',
    };
    // The form keeps its own state after mount; initial values are computed once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [values, setValues] = useState<TransactionFormValues>(initial);
  const [errors, setErrors] = useState<TransactionFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [unknownOutcome, setUnknownOutcome] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState(false);

  const wallet = wallets.find((candidate) => candidate.id === values.walletId);
  const currency = wallet?.currency ?? prefs.currency;
  const recentOfType = useMemo(
    () => recentCategories(recent, categories, type),
    [recent, categories, type],
  );
  const dirty =
    editing && transaction
      ? values.amount !== initial.amount ||
        values.categoryId !== initial.categoryId ||
        values.walletId !== initial.walletId ||
        values.date !== initial.date ||
        values.note !== initial.note ||
        type !== transaction.type
      : values.amount.trim() !== '' || values.categoryId !== null || values.note.trim() !== '';

  useEffect(() => props.onDirtyChange?.(dirty), [dirty]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    props.onDraftChange?.({
      amount: values.amount,
      walletId: values.walletId,
      date: values.date,
      note: values.note,
    });
  }, [values.amount, values.walletId, values.date, values.note]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (attempt > 0) focusFirstInvalid(formRef.current);
  }, [attempt]);
  useEffect(() => {
    if (layout === 'drawer') amountRef.current?.focus();
  }, [layout]);

  // Switching type keeps the money, wallet, date and note but clears a category of the wrong type.
  useEffect(() => {
    setValues((current) => {
      const selected = categories.find((category) => category.id === current.categoryId);
      if (!selected || selected.type === type) return current;
      announce('Category cleared. Categories differ by type.');
      return { ...current, categoryId: null };
    });
  }, [type, categories, announce]);

  const set = <K extends keyof TransactionFormValues>(key: K, value: TransactionFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
  };
  const clearError = (field: TransactionFormField) =>
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const { errors: found, valid } = validateTransactionForm(
      { ...values, type },
      { wallets, locale: prefs.locale, fallbackCurrency: prefs.currency },
    );
    setErrors(found);
    setFormError(null);
    setFailure(null);
    setUnknownOutcome(false);
    if (!valid) {
      setAttempt((count) => count + 1);
      return;
    }
    if (editing && transaction && !dirty) return;
    setPending(true);
    try {
      const saved =
        editing && transaction
          ? await updateTransaction(transaction.id, toUpdateTransaction(valid, transaction))
          : await createTransaction(toCreateTransaction(valid));
      storeLastWallet(user?.id, valid.walletId);
      await invalidateLedger();
      if (layout === 'bar' && !editing) {
        const name = categories.find((category) => category.id === valid.categoryId)?.name;
        const amountText = formatMinor(valid.amountMinor, currency, prefs.locale);
        announce(
          `${type === 'expense' ? 'Expense' : 'Income'} added, ${amountText}${name ? `, ${name}` : ''}.`,
        );
        setValues((current) => ({ ...current, amount: '', categoryId: null, note: '' }));
        amountRef.current?.focus();
      }
      onSaved(saved);
    } catch (caught) {
      const mapped = applyProblemToForm(caught, {
        fieldMap: TRANSACTION_FIELD_MAP,
        codeRules: {
          WALLET_ARCHIVED: {
            field: 'wallet',
            message: 'This wallet is archived. Choose another wallet.',
          },
          CATEGORY_RETIRED: {
            field: 'category',
            message: 'This category is no longer available. Choose another.',
          },
          CATEGORY_TYPE_MISMATCH: { message: 'Some options changed. Check your choices.' },
          INVALID_REFERENCE: { message: 'Some options changed. Check your choices.' },
          NOT_FOUND: { message: 'This transaction no longer exists.' },
          TRANSFER_LEG_IMMUTABLE: { message: 'This is part of a transfer.' },
        },
      });
      if (mapped.code === 'TRANSFER_LEG_IMMUTABLE') return void props.onTransferLeg?.();
      if (mapped.code === 'NOT_FOUND') {
        void invalidateLedger();
        props.onGone?.();
      }
      if (mapped.code === 'WALLET_ARCHIVED') void invalidateWallets();
      if (mapped.code === 'CATEGORY_RETIRED') void invalidateCategories();
      if (mapped.code === 'INVALID_REFERENCE' || mapped.code === 'CATEGORY_TYPE_MISMATCH') {
        void Promise.all([invalidateWallets(), invalidateCategories()]);
      }
      setErrors(mapped.fields as TransactionFormErrors);
      if (Object.keys(mapped.fields).length > 0) setAttempt((count) => count + 1);
      if (mapped.networkUnknown) setUnknownOutcome(true);
      else if (mapped.status !== undefined && mapped.status >= 400 && mapped.status < 500) {
        setFormError(mapped.form);
      } else if (Object.keys(mapped.fields).length === 0) setFailure(caught);
    } finally {
      setPending(false);
    }
  }

  const summary: SummaryError[] = (Object.keys(errors) as TransactionFormField[]).flatMap(
    (field) => {
      const message = errors[field];
      return message ? [{ id: `tx-${layout}-${field}`, label: FIELD_LABELS[field], message }] : [];
    },
  );
  const idOf = (field: TransactionFormField) => `tx-${layout}-${field}`;
  const bar = layout === 'bar';
  const futureDate = values.date > today;
  const submitLabel = editing ? 'Save changes' : type === 'expense' ? 'Add expense' : 'Add income';
  const noteLength = values.note.length;

  return (
    <form
      ref={formRef}
      noValidate
      aria-label={bar ? 'Quick add' : undefined}
      onSubmit={(event) => void onSubmit(event)}
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault();
          formRef.current?.requestSubmit();
        }
      }}
      className={cn('flex flex-col gap-4', bar && 'gap-3')}
    >
      <ErrorSummary errors={summary} />
      {formError ? <Alert variant="danger">{formError}</Alert> : null}
      {failure ? <ApiErrorAlert error={failure} /> : null}
      {unknownOutcome ? (
        <Alert variant="warning">
          We couldn&apos;t confirm this was saved. Check your recent transactions before adding it
          again.{' '}
          <Link to="/transactions" className="underline underline-offset-2">
            Open transactions
          </Link>
        </Alert>
      ) : null}
      <div className={cn('flex flex-col gap-4', bar && 'flex-row flex-wrap items-start gap-3')}>
        <FieldFrame
          id={idOf('amount')}
          label="Amount"
          required
          error={errors.amount}
          className={bar ? 'w-36' : undefined}
        >
          {(control) => (
            <MoneyField
              {...control}
              ref={amountRef}
              large={!bar}
              value={values.amount}
              currency={currency}
              enterKeyHint="next"
              placeholder="0.00"
              onChange={(text) => {
                set('amount', text);
                clearError('amount');
              }}
            />
          )}
        </FieldFrame>
        <div className={cn('flex flex-col gap-2', bar && 'w-52')}>
          {!bar ? (
            <RecentCategoryChips
              recent={recentOfType}
              value={values.categoryId}
              onPick={(id) => {
                set('categoryId', id);
                clearError('category');
              }}
            />
          ) : null}
          <FieldFrame id={idOf('category')} label="Category" required error={errors.category}>
            {(control) => (
              <CategoryCombobox
                {...control}
                categories={categories}
                type={type}
                recent={bar ? recentOfType : []}
                value={values.categoryId}
                placeholder="Search categories..."
                onEnterWhenClosed={() => formRef.current?.requestSubmit()}
                onChange={(id) => {
                  set('categoryId', id);
                  clearError('category');
                }}
              />
            )}
          </FieldFrame>
        </div>
        <FieldFrame
          id={idOf('wallet')}
          label="Wallet"
          required
          error={errors.wallet}
          className={bar ? 'w-44' : undefined}
        >
          {(control) => (
            <WalletCombobox
              {...control}
              wallets={activeWallets}
              value={values.walletId}
              onEnterWhenClosed={() => formRef.current?.requestSubmit()}
              fallbackLabel={wallet?.name ?? ''}
              onChange={(id) => {
                set('walletId', id);
                clearError('wallet');
              }}
            />
          )}
        </FieldFrame>
        <FieldFrame
          id={idOf('date')}
          label="Date"
          required
          error={errors.date}
          className={bar ? 'w-48' : undefined}
          helper={futureDate && !errors.date ? 'This date is in the future.' : undefined}
        >
          {(control) => (
            <DateField
              {...control}
              value={values.date}
              today={today}
              enterKeyHint="next"
              onChange={(date) => {
                set('date', date);
                clearError('date');
              }}
            />
          )}
        </FieldFrame>
        <FieldFrame
          id={idOf('note')}
          label={bar ? 'Note' : 'Note (optional)'}
          error={errors.note}
          className={bar ? 'min-w-40 flex-1' : undefined}
          meta={
            bar ? undefined : (
              <>
                <span aria-hidden="true">
                  {noteLength} / {NOTE_MAX_LENGTH}
                </span>
                <span className="sr-only" aria-live="polite">
                  {noteLength >= 450 ? `${noteLength} of ${NOTE_MAX_LENGTH} characters` : ''}
                </span>
              </>
            )
          }
        >
          {(control) =>
            bar ? (
              <input
                {...control}
                type="text"
                autoComplete="off"
                value={values.note}
                onChange={(event) => {
                  set('note', event.target.value);
                  clearError('note');
                }}
                className="h-10 w-full rounded-sm border border-line-strong bg-surface px-3 text-body text-ink focus-visible:border-ink"
              />
            ) : (
              <Textarea
                {...control}
                rows={2}
                autoComplete="off"
                value={values.note}
                invalid={control['aria-invalid'] === true}
                onChange={(event) => {
                  set('note', event.target.value);
                  clearError('note');
                }}
              />
            )
          }
        </FieldFrame>
      </div>
      <div
        className={cn(
          'flex gap-2',
          bar ? 'items-center' : 'flex-col-reverse sm:flex-row sm:items-center',
        )}
      >
        {props.onDelete ? (
          <Button variant="ghost" className="text-danger sm:mr-auto" onClick={props.onDelete}>
            {`Delete ${type}`}
          </Button>
        ) : null}
        {props.onCancel ? (
          <Button variant="secondary" onClick={props.onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button
          type="submit"
          loading={pending}
          aria-disabled={(editing && !dirty) || undefined}
          aria-describedby={editing && !dirty ? `tx-${layout}-nochange` : undefined}
        >
          {submitLabel}
        </Button>
        {editing && !dirty ? (
          <span id={`tx-${layout}-nochange`} className="text-body-sm text-ink-3">
            No changes to save.
          </span>
        ) : null}
      </div>
    </form>
  );
}

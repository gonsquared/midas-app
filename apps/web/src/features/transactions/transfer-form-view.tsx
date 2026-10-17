import type { Transfer, Wallet } from '@midas/shared';
import { NOTE_MAX_LENGTH } from '@midas/shared/money';
import { ArrowDownUp } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Amount } from '@/components/domain/amount';
import { DateField } from '@/components/domain/date-field';
import { MoneyField } from '@/components/domain/money-field';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useAnnounce } from '@/components/ui/announcer';
import { ApiErrorAlert } from '@/components/ui/api-error-alert';
import { Button } from '@/components/ui/button';
import { ErrorSummary, type SummaryError } from '@/components/ui/error-summary';
import { FieldFrame, Textarea } from '@/components/ui/form-field';
import { IconButton } from '@/components/ui/icon-button';
import { cn } from '@/lib/cn';
import { todayLocalDate } from '@/lib/dates';
import { focusFirstInvalid } from '@/lib/focus';
import { currencyExponent, formatMinor, toEditableAmount } from '@/lib/money';
import { parseAmountInput } from '@/lib/money-input';
import { usePreferences } from '@/lib/preferences';
import { applyProblemToForm } from '@/lib/problem-form';
import { useDebounced } from '@/lib/use-debounced';
import { useSession } from '@/lib/session';
import { useInvalidateWallets } from '@/features/wallets/api';
import { createTransfer, updateTransfer, useInvalidateLedger } from './api';
import type { ComposerPrefill } from './composer-store';
import { defaultWalletId, storeLastWallet } from './last-wallet';
import { WalletCombobox } from './pickers';
import type { TransactionDraft } from './transaction-form-view';
import {
  TRANSFER_FIELD_MAP,
  currenciesDiffer,
  toCreateTransfer,
  toUpdateTransfer,
  transferPreview,
  validateTransferForm,
  type TransferFormErrors,
  type TransferFormField,
  type TransferFormValues,
} from './transfer-form';

export interface TransferFormProps {
  layout: 'drawer' | 'bar';
  wallets: readonly Wallet[];
  transfer?: Transfer | undefined;
  prefill?: ComposerPrefill | null | undefined;
  draft?: TransactionDraft | undefined;
  onDraftChange?: (draft: TransactionDraft) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onSaved: (saved: Transfer) => void;
  onCancel?: () => void;
  onDelete?: () => void;
  onGone?: () => void;
}

const LABELS: Record<TransferFormField, string> = {
  from: 'From wallet',
  to: 'To wallet',
  amount: 'Amount',
  toAmount: 'They receive',
  date: 'Date',
  note: 'Note',
};

function PreviewValue({ minor, currency }: { minor: number; currency: string }) {
  return <Amount minor={minor} currency={currency} />;
}

export function TransferForm(props: TransferFormProps) {
  const { layout, wallets, transfer, onSaved } = props;
  const prefs = usePreferences();
  const { user } = useSession();
  const announce = useAnnounce();
  const invalidateLedger = useInvalidateLedger();
  const invalidateWallets = useInvalidateWallets();
  const formRef = useRef<HTMLFormElement>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  const editing = Boolean(transfer);
  const today = todayLocalDate(prefs.timezone);
  const active = useMemo(() => wallets.filter((wallet) => !wallet.archived), [wallets]);

  const initial = useMemo<TransferFormValues>(() => {
    if (transfer) {
      const from = wallets.find((w) => w.id === transfer.fromWallet.id);
      const to = wallets.find((w) => w.id === transfer.toWallet.id);
      return {
        fromId: transfer.fromWallet.id,
        toId: transfer.toWallet.id,
        amount: toEditableAmount(
          transfer.amountMinor,
          from?.currency ?? prefs.currency,
          prefs.locale,
        ),
        toAmount: toEditableAmount(
          transfer.toAmountMinor,
          to?.currency ?? prefs.currency,
          prefs.locale,
        ),
        date: transfer.occurredOn,
        note: transfer.note ?? '',
      };
    }
    const { draft, prefill } = props;
    return {
      fromId: prefill?.fromWalletId ?? draft?.walletId ?? defaultWalletId(wallets, user?.id),
      toId: prefill?.toWalletId ?? null,
      amount: draft?.amount ?? '',
      toAmount: '',
      date: draft?.date ?? prefill?.occurredOn ?? today,
      note: draft?.note ?? prefill?.note ?? '',
    };
    // Initial values are computed once; the form owns its state after mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [values, setValues] = useState<TransferFormValues>(initial);
  const [errors, setErrors] = useState<TransferFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [unknownOutcome, setUnknownOutcome] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState(false);

  const from = wallets.find((wallet) => wallet.id === values.fromId);
  const to = wallets.find((wallet) => wallet.id === values.toId);
  const cross = currenciesDiffer(from, to);
  const dirty = editing
    ? JSON.stringify(values) !== JSON.stringify(initial)
    : values.amount.trim() !== '' || values.toId !== null || values.note.trim() !== '';

  useEffect(() => props.onDirtyChange?.(dirty), [dirty]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    props.onDraftChange?.({
      amount: values.amount,
      walletId: values.fromId,
      date: values.date,
      note: values.note,
    });
  }, [values.amount, values.fromId, values.date, values.note]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (attempt > 0) focusFirstInvalid(formRef.current);
  }, [attempt]);
  useEffect(() => {
    if (layout === 'drawer') firstRef.current?.focus();
  }, [layout]);
  // The received amount belongs to a cross-currency transfer only.
  useEffect(() => {
    if (!cross) setValues((current) => (current.toAmount ? { ...current, toAmount: '' } : current));
  }, [cross]);

  const set = <K extends keyof TransferFormValues>(key: K, value: TransferFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    const field = key === 'fromId' ? 'from' : key === 'toId' ? 'to' : (key as TransferFormField);
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  };

  const previewInput = useDebounced(values, 300);
  const preview = useMemo(() => {
    const pf = wallets.find((w) => w.id === previewInput.fromId);
    const pt = wallets.find((w) => w.id === previewInput.toId);
    if (!pf || !pt || pf.id === pt.id) return null;
    const amount = parseAmountInput(previewInput.amount, {
      currency: pf.currency,
      locale: prefs.locale,
      positive: true,
    });
    if (amount.minor === null) return null;
    let received = amount.minor;
    if (pf.currency !== pt.currency) {
      const parsed = parseAmountInput(previewInput.toAmount, {
        currency: pt.currency,
        locale: prefs.locale,
        positive: true,
      });
      if (parsed.minor === null) return null;
      received = parsed.minor;
    }
    return transferPreview({
      from: pf,
      to: pt,
      amountMinor: amount.minor,
      toAmountMinor: received,
      editing: transfer,
    });
  }, [previewInput, wallets, prefs.locale, transfer]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const { errors: found, valid } = validateTransferForm(values, {
      wallets,
      locale: prefs.locale,
    });
    setErrors(found);
    setFormError(null);
    setFailure(null);
    setUnknownOutcome(false);
    if (!valid) {
      setAttempt((count) => count + 1);
      return;
    }
    if (editing && !dirty) return;
    setPending(true);
    try {
      const saved =
        editing && transfer
          ? await updateTransfer(transfer.id, toUpdateTransfer(valid, transfer))
          : await createTransfer(toCreateTransfer(valid));
      storeLastWallet(user?.id, valid.fromWalletId);
      await invalidateLedger();
      announce(
        `Moved ${formatMinor(valid.amountMinor, from?.currency ?? prefs.currency, prefs.locale)} from ${from?.name ?? 'wallet'} to ${to?.name ?? 'wallet'}.`,
      );
      onSaved(saved);
    } catch (caught) {
      const mapped = applyProblemToForm(caught, {
        fieldMap: TRANSFER_FIELD_MAP,
        codeRules: {
          WALLET_ARCHIVED: {
            field: 'from',
            message: 'This wallet is archived. Choose another wallet.',
          },
          SAME_WALLET_TRANSFER: { field: 'to', message: 'Choose a different wallet.' },
          TO_AMOUNT_REQUIRED: { field: 'toAmount', message: 'Enter the amount they receive.' },
          TO_AMOUNT_MISMATCH: { field: 'toAmount', message: 'Enter the amount they receive.' },
          INVALID_REFERENCE: { message: 'Some options changed. Check your choices.' },
          NOT_FOUND: { message: 'This transfer no longer exists.' },
        },
      });
      if (mapped.code === 'NOT_FOUND') props.onGone?.();
      if (mapped.code === 'WALLET_ARCHIVED' || mapped.code === 'INVALID_REFERENCE') {
        void invalidateWallets();
      }
      setErrors(mapped.fields as TransferFormErrors);
      if (Object.keys(mapped.fields).length > 0) setAttempt((count) => count + 1);
      if (mapped.networkUnknown) setUnknownOutcome(true);
      else if (mapped.status !== undefined && mapped.status >= 400 && mapped.status < 500) {
        setFormError(mapped.form);
      } else if (Object.keys(mapped.fields).length === 0) setFailure(caught);
    } finally {
      setPending(false);
    }
  }

  const summary: SummaryError[] = (Object.keys(errors) as TransferFormField[]).flatMap((field) => {
    const message = errors[field];
    return message ? [{ id: `tf-${layout}-${field}`, label: LABELS[field], message }] : [];
  });
  const idOf = (field: TransferFormField) => `tf-${layout}-${field}`;
  const noteLength = values.note.length;
  const rate =
    cross && from && to
      ? (() => {
          const a = parseAmountInput(values.amount, {
            currency: from.currency,
            locale: prefs.locale,
            positive: true,
          });
          const b = parseAmountInput(values.toAmount, {
            currency: to.currency,
            locale: prefs.locale,
            positive: true,
          });
          if (a.minor === null || b.minor === null) return null;
          const ratio =
            b.minor /
            10 ** currencyExponent(to.currency) /
            (a.minor / 10 ** currencyExponent(from.currency));
          return `About 1 ${from.currency} = ${Number(ratio.toPrecision(4))} ${to.currency}`;
        })()
      : null;

  return (
    <form
      ref={formRef}
      noValidate
      aria-label={layout === 'bar' ? 'Quick add' : undefined}
      onSubmit={(event) => void onSubmit(event)}
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault();
          formRef.current?.requestSubmit();
        }
      }}
      className="flex flex-col gap-4"
    >
      <ErrorSummary errors={summary} />
      {formError ? <Alert variant="danger">{formError}</Alert> : null}
      {failure ? <ApiErrorAlert error={failure} /> : null}
      {unknownOutcome ? (
        <Alert variant="warning">
          We couldn&apos;t confirm this was saved. Check your recent transactions before moving the
          money again.
        </Alert>
      ) : null}
      {active.length < 2 && !editing ? (
        <Alert variant="info">Transfers need two wallets. Create another wallet first.</Alert>
      ) : null}
      <div
        className={cn(
          'flex flex-col gap-4',
          layout === 'bar' && 'sm:flex-row sm:flex-wrap sm:items-start',
        )}
      >
        <FieldFrame id={idOf('from')} label="From wallet" required error={errors.from}>
          {(control) => (
            <WalletCombobox
              {...control}
              ref={firstRef}
              wallets={active}
              value={values.fromId}
              disabledIds={values.toId ? [values.toId] : []}
              disabledReason="selected as To"
              onChange={(id) => set('fromId', id)}
            />
          )}
        </FieldFrame>
        <div className="flex justify-center">
          <IconButton
            label="Swap From and To wallets"
            icon={<ArrowDownUp className="size-4" />}
            className="border border-line-strong"
            onClick={() => setValues((c) => ({ ...c, fromId: c.toId, toId: c.fromId }))}
          />
        </div>
        <FieldFrame id={idOf('to')} label="To wallet" required error={errors.to}>
          {(control) => (
            <WalletCombobox
              {...control}
              wallets={active}
              value={values.toId}
              disabledIds={values.fromId ? [values.fromId] : []}
              disabledReason="selected as From"
              onChange={(id) => set('toId', id)}
            />
          )}
        </FieldFrame>
        <FieldFrame id={idOf('amount')} label="Amount" required error={errors.amount}>
          {(control) => (
            <MoneyField
              {...control}
              large={layout === 'drawer'}
              value={values.amount}
              currency={from?.currency ?? prefs.currency}
              placeholder="0.00"
              onChange={(text) => set('amount', text)}
            />
          )}
        </FieldFrame>
        {cross && to ? (
          <FieldFrame
            id={idOf('toAmount')}
            label="They receive"
            required
            error={errors.toAmount}
            helper={rate ?? undefined}
          >
            {(control) => (
              <MoneyField
                {...control}
                value={values.toAmount}
                currency={to.currency}
                placeholder="0.00"
                onChange={(text) => set('toAmount', text)}
              />
            )}
          </FieldFrame>
        ) : null}
        <FieldFrame id={idOf('date')} label="Date" required error={errors.date}>
          {(control) => (
            <DateField
              {...control}
              value={values.date}
              today={today}
              onChange={(date) => set('date', date)}
            />
          )}
        </FieldFrame>
        <FieldFrame
          id={idOf('note')}
          label="Note (optional)"
          error={errors.note}
          meta={
            <span aria-hidden="true">
              {noteLength} / {NOTE_MAX_LENGTH}
            </span>
          }
        >
          {(control) => (
            <Textarea
              {...control}
              rows={2}
              autoComplete="off"
              value={values.note}
              invalid={control['aria-invalid'] === true}
              onChange={(event) => set('note', event.target.value)}
            />
          )}
        </FieldFrame>
      </div>
      <section aria-labelledby={`tf-${layout}-preview`} className="rounded-md bg-sunken p-3">
        <h3 id={`tf-${layout}-preview`} className="text-body-sm font-semibold">
          After this transfer
        </h3>
        <div aria-live="polite" className="mt-1 text-body-sm">
          {preview ? (
            <dl className="flex flex-col gap-1">
              {preview.map((line) => (
                <div key={line.walletId} className="flex flex-wrap items-center gap-x-2">
                  <dt className="font-medium">{line.name}</dt>
                  <dd className="flex flex-wrap items-center gap-x-1 text-ink-2">
                    <PreviewValue minor={line.before} currency={line.currency} />
                    <span aria-hidden="true">&rarr;</span>
                    <span className="sr-only">to</span>
                    <PreviewValue minor={line.after} currency={line.currency} />
                    {line.overdrawn ? (
                      <>
                        <Badge variant="danger">Overdrawn</Badge>
                        <span>This will leave {line.name} overdrawn.</span>
                      </>
                    ) : null}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-ink-3">Choose both wallets and enter an amount to see the effect.</p>
          )}
        </div>
      </section>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
        {props.onDelete ? (
          <Button variant="ghost" className="text-danger sm:mr-auto" onClick={props.onDelete}>
            Delete transfer
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
          aria-describedby={editing && !dirty ? `tf-${layout}-nochange` : undefined}
        >
          {editing ? 'Save changes' : 'Move money'}
        </Button>
        {editing && !dirty ? (
          <span id={`tf-${layout}-nochange`} className="text-body-sm text-ink-3">
            No changes to save.
          </span>
        ) : null}
      </div>
    </form>
  );
}

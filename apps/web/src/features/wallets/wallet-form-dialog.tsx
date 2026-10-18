import type { Wallet } from '@midas/shared';
import { WALLET_NAME_MAX_LENGTH } from '@midas/shared/wallets';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useBreakpoint } from '@/app/shell/use-breakpoint';
import { CurrencyCombobox } from '@/components/domain/currency-combobox';
import { MoneyField } from '@/components/domain/money-field';
import {
  WALLET_TYPE_HINTS,
  WALLET_TYPE_ICONS,
  WALLET_TYPE_LABELS,
} from '@/components/domain/wallet-type-icon';
import { Alert } from '@/components/ui/alert';
import { ApiErrorAlert } from '@/components/ui/api-error-alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ErrorSummary, type SummaryError } from '@/components/ui/error-summary';
import { FieldFrame } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { RadioCardGroup } from '@/components/ui/segmented';
import { focusFirstInvalid } from '@/lib/focus';
import { formatMinor } from '@/lib/money';
import { parseAmountInput } from '@/lib/money-input';
import { applyProblemToForm } from '@/lib/problem-form';
import { usePreferences } from '@/lib/preferences';
import { createWallet, unarchiveWallet, updateWallet, useInvalidateWallets } from './api';
import {
  initialValues,
  isDirty,
  toCreateRequest,
  toUpdateRequest,
  validateWalletForm,
  type WalletFormErrors,
  type WalletFormValues,
} from './wallet-form';

const TYPES = Object.keys(WALLET_TYPE_LABELS) as Array<keyof typeof WALLET_TYPE_LABELS>;
const TYPE_OPTIONS = TYPES.map((type) => {
  const Icon = WALLET_TYPE_ICONS[type];
  return {
    value: type,
    label: WALLET_TYPE_LABELS[type],
    description: WALLET_TYPE_HINTS[type],
    icon: <Icon className="size-5" />,
  };
});

const FIELD_LABELS = {
  name: 'Name',
  type: 'Type',
  currency: 'Currency',
  opening: 'Opening balance',
} as const;

export interface WalletFormDialogProps {
  mode: 'create' | 'edit';
  wallet?: Wallet;
  onClose: () => void;
  onSaved: (wallet: Wallet) => void;
  /** The wallet no longer exists (404): close and refetch. */
  onGone: () => void;
}

function BalanceEquation({
  wallet,
  values,
  locale,
}: {
  wallet: Wallet;
  values: WalletFormValues;
  locale: string;
}) {
  const activity = wallet.balanceMinor - wallet.openingBalanceMinor;
  const parsed = parseAmountInput(values.opening, {
    currency: wallet.currency,
    locale,
    allowNegative: true,
  });
  const fmt = (minor: number) => formatMinor(minor, wallet.currency, locale);
  const next =
    parsed.minor !== null && !parsed.error && parsed.minor !== wallet.openingBalanceMinor
      ? wallet.balanceMinor + (parsed.minor - wallet.openingBalanceMinor)
      : null;
  return (
    <div className="flex flex-col gap-1 rounded-md bg-sunken p-3 text-body-sm">
      <dl className="flex flex-wrap gap-x-2 gap-y-1 text-ink-2">
        <dt>Opening</dt>
        <dd className="tabular text-ink">{fmt(wallet.openingBalanceMinor)}</dd>
        <dt>+ activity</dt>
        <dd className="tabular text-ink">{fmt(activity)}</dd>
        <dt>= Balance</dt>
        <dd className="tabular text-ink">{fmt(wallet.balanceMinor)}</dd>
      </dl>
      {next !== null ? (
        <p role="status">
          Balance will change from {fmt(wallet.balanceMinor)} to {fmt(next)}.
        </p>
      ) : null}
    </div>
  );
}

export function WalletFormDialog({
  mode,
  wallet,
  onClose,
  onSaved,
  onGone,
}: WalletFormDialogProps) {
  const { currency: defaultCurrency, locale } = usePreferences();
  const breakpoint = useBreakpoint();
  const invalidate = useInvalidateWallets();
  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const initial = useMemo(
    () => initialValues(wallet, { currency: defaultCurrency, locale }),
    [wallet, defaultCurrency, locale],
  );
  const [values, setValues] = useState<WalletFormValues>(initial);
  const [errors, setErrors] = useState<WalletFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [locked, setLocked] = useState(false);

  const archived = mode === 'edit' && wallet?.archived === true;
  const currencyLocked = mode === 'edit' && (wallet?.hasTransactions === true || locked);
  const dirty = isDirty(values, initial);
  const set = <K extends keyof WalletFormValues>(key: K, value: WalletFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }));
  };

  useEffect(() => {
    if (attempt > 0) focusFirstInvalid(formRef.current);
  }, [attempt]);

  const requestClose = () => {
    if (dirty && !pending) setConfirmDiscard(true);
    else onClose();
  };

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending || (mode === 'edit' && !dirty)) return;
    const { errors: found, valid } = validateWalletForm(values, locale);
    setErrors(found);
    setFormError(null);
    setFailure(null);
    if (!valid) {
      setAttempt((count) => count + 1);
      return;
    }
    setPending(true);
    try {
      const saved =
        mode === 'edit' && wallet
          ? await updateWallet(wallet.id, toUpdateRequest(valid, wallet))
          : await createWallet(toCreateRequest(valid));
      await invalidate();
      onSaved(saved);
    } catch (caught) {
      const mapped = applyProblemToForm(caught, {
        fieldMap: {
          name: 'name',
          type: 'type',
          currency: 'currency',
          openingBalanceMinor: 'opening',
        },
        codeRules: {
          WALLET_NAME_TAKEN: {
            field: 'name',
            message: 'You already have a wallet with this name.',
          },
          LIMIT_REACHED: { message: 'You have reached the limit of 100 wallets.' },
          WALLET_CURRENCY_LOCKED: {
            field: 'currency',
            message:
              "Currency can't change because this wallet has transactions or recurring transactions.",
          },
          WALLET_ARCHIVED: { message: 'This wallet was archived. Unarchive it to make changes.' },
        },
      });
      if (mapped.code === 'NOT_FOUND') {
        onGone();
        return;
      }
      if (mapped.code === 'WALLET_CURRENCY_LOCKED') {
        setLocked(true);
        void invalidate();
      }
      setErrors(mapped.fields as WalletFormErrors);
      if (Object.keys(mapped.fields).length > 0) setAttempt((count) => count + 1);
      else if (
        mapped.form &&
        mapped.status !== undefined &&
        mapped.status < 500 &&
        mapped.status > 0
      ) {
        setFormError(mapped.form);
      } else setFailure(caught);
    } finally {
      setPending(false);
    }
  }

  const summary: SummaryError[] = (Object.keys(errors) as Array<keyof WalletFormValues>).flatMap(
    (field) => {
      const message = errors[field];
      return message ? [{ id: `wallet-${field}`, label: FIELD_LABELS[field], message }] : [];
    },
  );
  const negativeOpening = (() => {
    const parsed = parseAmountInput(values.opening, {
      currency: values.currency || 'USD',
      locale,
      allowNegative: true,
    });
    return (
      parsed.minor !== null && parsed.minor < 0 && values.type !== null && values.type !== 'card'
    );
  })();
  const title = mode === 'create' ? 'Create wallet' : archived ? 'Archived wallet' : 'Edit wallet';

  const nameLength = values.name.length;
  return (
    <>
      <Dialog open onOpenChange={(open) => !open && requestClose()}>
        <DialogContent
          title={title}
          variant={breakpoint === 'mobile' ? 'sheet' : 'dialog'}
          className="sm:max-w-[30rem]"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            nameRef.current?.focus();
          }}
        >
          {archived && wallet ? (
            <div className="flex flex-col gap-4">
              <Alert variant="info">
                Archived wallets are read-only. Unarchive it to make changes.
              </Alert>
              <Button
                onClick={() => {
                  void unarchiveWallet(wallet.id)
                    .then(() => invalidate())
                    .then(onClose)
                    .catch((caught: unknown) => setFailure(caught));
                }}
              >
                Unarchive wallet
              </Button>
              {failure ? <ApiErrorAlert error={failure} /> : null}
            </div>
          ) : (
            <form
              ref={formRef}
              noValidate
              onSubmit={(event) => void onSubmit(event)}
              className="flex flex-col gap-4"
            >
              <ErrorSummary errors={summary} />
              {formError ? <Alert variant="danger">{formError}</Alert> : null}
              {failure ? <ApiErrorAlert error={failure} /> : null}
              <FieldFrame
                id="wallet-name"
                label="Name"
                required
                error={errors.name}
                meta={
                  <>
                    <span aria-hidden="true">
                      {nameLength} / {WALLET_NAME_MAX_LENGTH}
                    </span>
                    <span className="sr-only" aria-live="polite">
                      {nameLength >= 50
                        ? `${nameLength} of ${WALLET_NAME_MAX_LENGTH} characters`
                        : ''}
                    </span>
                  </>
                }
              >
                {(control) => (
                  <Input
                    ref={nameRef}
                    {...control}
                    name="name"
                    autoComplete="off"
                    value={values.name}
                    onChange={(event) => set('name', event.target.value)}
                    invalid={control['aria-invalid'] === true}
                  />
                )}
              </FieldFrame>
              <div id="wallet-type" tabIndex={-1} data-invalid={errors.type ? true : undefined}>
                <RadioCardGroup
                  legend="Type"
                  options={TYPE_OPTIONS}
                  value={values.type}
                  onChange={(type) => set('type', type)}
                />
                {errors.type ? (
                  <p className="mt-1 text-body-sm text-danger">{errors.type}</p>
                ) : null}
              </div>
              <FieldFrame
                id="wallet-currency"
                label="Currency"
                required
                error={errors.currency}
                helper={
                  currencyLocked
                    ? "Currency can't change because this wallet has transactions."
                    : undefined
                }
              >
                {(control) => (
                  <CurrencyCombobox
                    {...control}
                    value={values.currency}
                    disabled={currencyLocked}
                    onChange={(currency) => set('currency', currency)}
                  />
                )}
              </FieldFrame>
              <FieldFrame
                id="wallet-opening"
                label="Opening balance"
                error={errors.opening}
                helper="What was in this wallet before your first transaction. Use a minus sign for money owed."
              >
                {(control) => (
                  <MoneyField
                    {...control}
                    name="opening"
                    value={values.opening}
                    onChange={(text) => set('opening', text)}
                    currency={values.currency}
                    placeholder="0.00"
                  />
                )}
              </FieldFrame>
              {negativeOpening ? (
                <Alert variant="info">This wallet will show as Overdrawn.</Alert>
              ) : null}
              {mode === 'edit' && wallet ? (
                <BalanceEquation wallet={wallet} values={values} locale={locale} />
              ) : null}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                {mode === 'edit' && !dirty ? (
                  <p id="wallet-no-changes" className="text-body-sm text-ink-3 sm:mr-auto">
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
                  aria-describedby={mode === 'edit' && !dirty ? 'wallet-no-changes' : undefined}
                >
                  {mode === 'create' ? 'Create wallet' : 'Save changes'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard this wallet?"
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

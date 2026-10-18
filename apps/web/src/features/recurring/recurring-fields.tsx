import type { Category, RecurringFrequency, Wallet } from '@midas/shared';
import { RECURRING_MAX_BACKDATE_DAYS } from '@midas/shared/recurring';
import type { Ref } from 'react';
import { DateField } from '@/components/domain/date-field';
import { MoneyField } from '@/components/domain/money-field';
import { FieldFrame, NativeSelect, Textarea } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { addDays } from '@/lib/dates';
import {
  parseInterval,
  type RecurringFormErrors,
  type RecurringFormValues,
} from './recurring-form';
import { SchedulePreviewList } from './schedule-preview';
import type { SchedulePreview } from './use-schedule-preview';

const TYPE_OPTIONS = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
] as const;
const END_OPTIONS = [
  { value: 'never', label: 'Never' },
  { value: 'on', label: 'On date' },
] as const;
const UNITS: Record<RecurringFrequency, string> = {
  daily: 'day',
  weekly: 'week',
  monthly: 'month',
  yearly: 'year',
};

export interface RecurringFieldsProps {
  mode: 'create' | 'edit';
  values: RecurringFormValues;
  errors: RecurringFormErrors;
  set: <K extends keyof RecurringFormValues>(key: K, value: RecurringFormValues[K]) => void;
  currency: string;
  wallets: readonly Wallet[];
  categories: readonly Category[];
  today: string;
  locale: string;
  preview: SchedulePreview;
  firstRef: Ref<HTMLInputElement>;
  initialCategoryId: string;
}

export function RecurringFields(props: RecurringFieldsProps) {
  const { mode, values, errors, set, currency, wallets, categories } = props;
  const categoryOptions = [
    { value: '', label: 'Choose a category' },
    ...categories
      .filter((c) => c.type === values.type && (!c.retired || c.id === props.initialCategoryId))
      .map((c) => ({ value: c.id, label: c.retired ? `${c.name} (retired)` : c.name })),
  ];
  const walletOptions = [
    { value: '', label: 'Choose a wallet' },
    ...wallets.map((w) => ({
      value: w.id,
      label: w.archived ? `${w.name} (archived)` : `${w.name} (${w.currency})`,
    })),
  ];
  return (
    <>
      {mode === 'create' ? (
        <Segmented
          legend="Type"
          legendHidden={false}
          options={TYPE_OPTIONS}
          value={values.type}
          onChange={(type) => {
            set('type', type);
            set('categoryId', '');
          }}
        />
      ) : (
        <p className="text-body-sm text-ink-3">
          Type: {values.type === 'expense' ? 'Expense' : 'Income'}. It can&apos;t be changed.
        </p>
      )}
      <FieldFrame id="recurring-name" label="Name" required error={errors.name}>
        {(control) => (
          <Input
            {...control}
            ref={props.firstRef}
            name="name"
            autoComplete="off"
            value={values.name}
            onChange={(event) => set('name', event.target.value)}
            invalid={control['aria-invalid'] === true}
          />
        )}
      </FieldFrame>
      <FieldFrame id="recurring-amount" label="Amount" required error={errors.amount}>
        {(control) => (
          <MoneyField
            {...control}
            name="amount"
            currency={currency}
            value={values.amount}
            onChange={(value) => set('amount', value)}
          />
        )}
      </FieldFrame>
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldFrame id="recurring-wallet" label="Wallet" required error={errors.walletId}>
          {(control) => (
            <NativeSelect
              {...control}
              value={values.walletId}
              onChange={(value) => set('walletId', value)}
              options={walletOptions}
              invalid={control['aria-invalid'] === true}
            />
          )}
        </FieldFrame>
        <FieldFrame id="recurring-category" label="Category" required error={errors.categoryId}>
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
      </div>
      <FieldFrame id="recurring-note" label="Note (optional)" error={errors.note}>
        {(control) => (
          <Textarea
            {...control}
            rows={2}
            autoComplete="off"
            value={values.note}
            onChange={(event) => set('note', event.target.value)}
            invalid={control['aria-invalid'] === true}
          />
        )}
      </FieldFrame>
      <ScheduleFields {...props} />
    </>
  );
}

function ScheduleFields(props: RecurringFieldsProps) {
  const { mode, values, errors, set, today, locale, preview } = props;
  const interval = parseInterval(values.interval);
  const minStart = mode === 'create' ? addDays(today, -RECURRING_MAX_BACKDATE_DAYS) : undefined;
  const ready = !errors.startDate && !errors.endDate && interval !== null;
  const frequencyOptions = (Object.keys(UNITS) as RecurringFrequency[]).map((value) => ({
    value,
    label: `${UNITS[value]}${interval === 1 ? '' : 's'}`,
  }));
  return (
    <>
      <FieldFrame id="recurring-interval" label="Repeats every" required error={errors.interval}>
        {(control) => (
          <div className="flex gap-2">
            <Input
              {...control}
              name="interval"
              inputMode="numeric"
              autoComplete="off"
              className="w-20"
              value={values.interval}
              onChange={(event) => set('interval', event.target.value)}
              invalid={control['aria-invalid'] === true}
            />
            <NativeSelect
              aria-label="Unit"
              className="flex-1"
              value={values.frequency}
              onChange={(value) => set('frequency', value as RecurringFrequency)}
              options={frequencyOptions}
            />
          </div>
        )}
      </FieldFrame>
      <FieldFrame id="recurring-start" label="Starts" required error={errors.startDate}>
        {(control) => (
          <DateField
            {...control}
            value={values.startDate}
            today={today}
            {...(minStart ? { min: minStart } : {})}
            onChange={(value) => set('startDate', value)}
          />
        )}
      </FieldFrame>
      <Segmented
        legend="Ends"
        legendHidden={false}
        options={END_OPTIONS}
        value={values.endMode}
        onChange={(endMode) => set('endMode', endMode)}
      />
      {values.endMode === 'on' ? (
        <FieldFrame id="recurring-end" label="End date" error={errors.endDate}>
          {(control) => (
            <DateField
              {...control}
              value={values.endDate}
              onChange={(value) => set('endDate', value)}
            />
          )}
        </FieldFrame>
      ) : null}
      <SchedulePreviewList
        preview={preview}
        schedule={{
          frequency: values.frequency,
          interval: interval ?? 1,
          startDate: values.startDate,
        }}
        locale={locale}
        ready={ready}
      />
    </>
  );
}

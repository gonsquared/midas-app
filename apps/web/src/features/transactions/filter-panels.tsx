import type { Category, TransactionType, Wallet } from '@midas/shared';
import { useId, useMemo, useState } from 'react';
import { CategoryChip } from '@/components/domain/category-chip';
import { DateField } from '@/components/domain/date-field';
import { MoneyField } from '@/components/domain/money-field';
import { FieldFrame, NativeSelect } from '@/components/ui/form-field';
import { datePresets, type DatePresetKey } from '@/lib/dates';
import { parseAmountInput } from '@/lib/money-input';
import { toEditableAmount } from '@/lib/money';
import { disambiguatedLabels } from '@/features/categories/category-form';
import { amountFilterCurrency, type TransactionFilters } from './filters';

export type FilterPatch = Partial<TransactionFilters>;

interface PanelProps {
  filters: TransactionFilters;
  onChange: (patch: FilterPatch) => void;
}

const PRESET_LABELS: Array<[DatePresetKey | 'all' | 'custom', string]> = [
  ['all', 'All dates'],
  ['this-month', 'This month'],
  ['last-month', 'Last month'],
  ['last-30', 'Last 30 days'],
  ['last-90', 'Last 90 days'],
  ['this-year', 'This year'],
  ['custom', 'Custom'],
];

export function activePreset(
  filters: Pick<TransactionFilters, 'from' | 'to'>,
  today: string,
): DatePresetKey | 'all' | 'custom' {
  if (!filters.from && !filters.to) return 'all';
  const presets = datePresets(today);
  for (const [key, range] of Object.entries(presets)) {
    if (range.from === filters.from && range.to === filters.to) return key as DatePresetKey;
  }
  return 'custom';
}

export function DatesPanel({ filters, onChange, today }: PanelProps & { today: string }) {
  const name = useId();
  const detected = activePreset(filters, today);
  const [customOpen, setCustomOpen] = useState(detected === 'custom');
  const selected = customOpen ? 'custom' : detected;
  const invalidRange = Boolean(filters.from && filters.to && filters.to < filters.from);
  return (
    <fieldset className="flex min-w-0 flex-col gap-1">
      <legend className="mb-1 text-body-sm font-medium text-ink-2">Dates</legend>
      {PRESET_LABELS.map(([key, label]) => (
        <label
          key={key}
          className="flex min-h-9 items-center gap-2 text-body-sm pointer-coarse:min-h-11"
        >
          <input
            type="radio"
            name={name}
            checked={selected === key}
            onChange={() => {
              if (key === 'custom') return setCustomOpen(true);
              setCustomOpen(false);
              if (key === 'all') return onChange({ from: undefined, to: undefined });
              onChange(datePresets(today)[key]);
            }}
          />
          {label}
        </label>
      ))}
      {selected === 'custom' ? (
        <div className="mt-2 flex flex-col gap-3">
          <FieldFrame label="From">
            {(control) => (
              <DateField
                {...control}
                value={filters.from ?? ''}
                onChange={(from) => onChange({ from: from || undefined })}
              />
            )}
          </FieldFrame>
          <FieldFrame
            label="To"
            error={invalidRange ? 'End date must be on or after the start date.' : undefined}
          >
            {(control) => (
              <DateField
                {...control}
                value={filters.to ?? ''}
                onChange={(to) => onChange({ to: to || undefined })}
              />
            )}
          </FieldFrame>
        </div>
      ) : null}
    </fieldset>
  );
}

function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function WalletsPanel({
  filters,
  onChange,
  wallets,
}: PanelProps & { wallets: readonly Wallet[] }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-1">
      <legend className="mb-1 text-body-sm font-medium text-ink-2">Wallets</legend>
      {wallets.map((wallet) => (
        <label
          key={wallet.id}
          className="flex min-h-9 items-center gap-2 text-body-sm pointer-coarse:min-h-11"
        >
          <input
            type="checkbox"
            checked={filters.wallet.includes(wallet.id)}
            onChange={() => onChange({ wallet: toggle(filters.wallet, wallet.id) })}
          />
          <span dir="auto" className="min-w-0 truncate">
            {wallet.name}
          </span>
          {wallet.archived ? <span className="text-caption text-ink-3">Archived</span> : null}
        </label>
      ))}
    </fieldset>
  );
}

export function TypePanel({ filters, onChange }: PanelProps) {
  const options: Array<[TransactionType, string]> = [
    ['expense', 'Expense'],
    ['income', 'Income'],
    ['transfer', 'Transfer'],
  ];
  return (
    <fieldset className="flex min-w-0 flex-col gap-1">
      <legend className="mb-1 text-body-sm font-medium text-ink-2">Type</legend>
      {options.map(([value, label]) => (
        <label
          key={value}
          className="flex min-h-9 items-center gap-2 text-body-sm pointer-coarse:min-h-11"
        >
          <input
            type="checkbox"
            checked={filters.type.includes(value)}
            onChange={() => onChange({ type: toggle(filters.type, value) })}
          />
          {label}
        </label>
      ))}
    </fieldset>
  );
}

export function CategoriesPanel({
  filters,
  onChange,
  categories,
}: PanelProps & { categories: readonly Category[] }) {
  const [query, setQuery] = useState('');
  const searchId = useId();
  const labels = useMemo(() => disambiguatedLabels(categories), [categories]);
  const needle = query.trim().toLowerCase();
  const visible = categories.filter(
    (category) => !needle || category.name.toLowerCase().includes(needle),
  );
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={searchId} className="text-body-sm font-medium text-ink-2">
        Filter categories
      </label>
      <input
        id={searchId}
        type="search"
        autoComplete="off"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="h-10 w-full rounded-sm border border-line-strong bg-surface px-3 text-body focus-visible:border-ink"
      />
      <div className="max-h-64 overflow-y-auto">
        {(['expense', 'income'] as const).map((type) => {
          const list = visible.filter((category) => category.type === type);
          if (list.length === 0) return null;
          return (
            <fieldset key={type} className="mb-2 flex min-w-0 flex-col gap-1">
              <legend className="mb-1 text-body-sm font-medium text-ink-2">
                {type === 'expense' ? 'Expense' : 'Income'}
              </legend>
              {list.map((category) => (
                <label
                  key={category.id}
                  className="flex min-h-9 items-center gap-2 text-body-sm pointer-coarse:min-h-11"
                >
                  <input
                    type="checkbox"
                    checked={filters.category.includes(category.id)}
                    onChange={() => onChange({ category: toggle(filters.category, category.id) })}
                  />
                  <CategoryChip
                    icon={category.icon}
                    color={category.color}
                    size="sm"
                    name={
                      (labels.get(category.id) ?? category.name) +
                      (category.retired ? ' (retired)' : '')
                    }
                  />
                </label>
              ))}
            </fieldset>
          );
        })}
        {visible.length === 0 ? (
          <p className="text-body-sm text-ink-3">No categories match.</p>
        ) : null}
      </div>
    </div>
  );
}

export function AmountPanel({
  filters,
  onChange,
  wallets,
  locale,
}: PanelProps & { wallets: readonly Wallet[]; locale: string }) {
  const currency = amountFilterCurrency(filters, wallets);
  const [min, setMin] = useState(
    filters.min !== undefined && currency ? toEditableAmount(filters.min, currency, locale) : '',
  );
  const [max, setMax] = useState(
    filters.max !== undefined && currency ? toEditableAmount(filters.max, currency, locale) : '',
  );
  const [errors, setErrors] = useState<{ min?: string; max?: string }>({});
  const hintId = useId();

  if (!currency) {
    return (
      <p id={hintId} className="text-body-sm text-ink-2">
        Choose wallets in one currency to filter by amount.
      </p>
    );
  }

  const apply = (nextMin: string, nextMax: string) => {
    const a = parseAmountInput(nextMin, { currency, locale });
    const b = parseAmountInput(nextMax, { currency, locale });
    const found: { min?: string; max?: string } = {};
    if (a.error) found.min = a.error;
    if (b.error) found.max = b.error;
    if (!found.min && !found.max && a.minor && b.minor && b.minor < a.minor) {
      found.max = 'Maximum must be at least the minimum.';
    }
    setErrors(found);
    if (found.min || found.max) return;
    onChange({ min: a.minor || undefined, max: b.minor || undefined });
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body-sm text-ink-3">Amounts in {currency}.</p>
      <FieldFrame label="Minimum" error={errors.min}>
        {(control) => (
          <MoneyField
            {...control}
            value={min}
            currency={currency}
            onChange={setMin}
            onBlur={() => apply(min, max)}
          />
        )}
      </FieldFrame>
      <FieldFrame label="Maximum" error={errors.max}>
        {(control) => (
          <MoneyField
            {...control}
            value={max}
            currency={currency}
            onChange={setMax}
            onBlur={() => apply(min, max)}
          />
        )}
      </FieldFrame>
    </div>
  );
}

const SORT_OPTIONS = [
  { value: 'date_desc', label: 'Newest first' },
  { value: 'date_asc', label: 'Oldest first' },
  { value: 'amount_desc', label: 'Highest amount' },
  { value: 'amount_asc', label: 'Lowest amount' },
] as const;

export function SortSelect({
  filters,
  onChange,
  multiCurrency,
}: PanelProps & { multiCurrency: boolean }) {
  return (
    <FieldFrame
      label="Sort"
      helper={
        multiCurrency ? 'Amount sorts compare numbers as stored, not converted value.' : undefined
      }
    >
      {(control) => (
        <NativeSelect
          {...control}
          value={filters.sort}
          options={SORT_OPTIONS}
          onChange={(sort) => onChange({ sort: sort as TransactionFilters['sort'] })}
        />
      )}
    </FieldFrame>
  );
}

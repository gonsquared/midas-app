import type { Category, CategoryType, Transaction, Wallet } from '@midas/shared';
import { useMemo } from 'react';
import { Amount } from '@/components/domain/amount';
import { CategoryChip } from '@/components/domain/category-chip';
import { Combobox, type ComboboxOption, type ComboboxProps } from '@/components/ui/combobox';
import { cn } from '@/lib/cn';
import { disambiguatedLabels } from '@/features/categories/category-form';

type PickerBase = Omit<ComboboxProps, 'options' | 'value' | 'onChange'>;

/** Distinct categories of one type from recent transactions, newest first (up to `limit`). */
export function recentCategories(
  recent: readonly Transaction[] | undefined,
  categories: readonly Category[],
  type: CategoryType,
  limit = 5,
): Category[] {
  const result: Category[] = [];
  for (const transaction of recent ?? []) {
    const id = transaction.category?.id;
    if (!id || result.some((category) => category.id === id)) continue;
    const category = categories.find((c) => c.id === id);
    if (category && category.type === type && !category.retired) result.push(category);
    if (result.length >= limit) break;
  }
  return result;
}

export function WalletCombobox({
  wallets,
  value,
  onChange,
  disabledIds = [],
  disabledReason = 'selected in the other field',
  loading,
  ...rest
}: PickerBase & {
  wallets: readonly Wallet[];
  value: string | null;
  onChange: (id: string) => void;
  disabledIds?: readonly string[];
  disabledReason?: string;
}) {
  const options = useMemo<ComboboxOption[]>(
    () =>
      wallets.map((wallet) => ({
        value: wallet.id,
        label: disabledIds.includes(wallet.id) ? `${wallet.name} (${disabledReason})` : wallet.name,
        disabled: disabledIds.includes(wallet.id),
        secondary: <Amount minor={wallet.balanceMinor} currency={wallet.currency} />,
      })),
    [wallets, disabledIds, disabledReason],
  );
  return (
    <Combobox
      {...rest}
      {...(loading !== undefined ? { loading } : {})}
      options={options}
      value={value}
      onChange={onChange}
      emptyText="You have no wallets to choose from."
    />
  );
}

export function CategoryCombobox({
  categories,
  type,
  recent,
  value,
  onChange,
  ...rest
}: PickerBase & {
  categories: readonly Category[];
  type: CategoryType;
  recent: readonly Category[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  const options = useMemo<ComboboxOption[]>(() => {
    // A retired category stays selectable only when it is the current value of an edit.
    const eligible = categories.filter(
      (category) => category.type === type && (!category.retired || category.id === value),
    );
    const labels = disambiguatedLabels(eligible);
    const toOption = (category: Category, group: string): ComboboxOption => ({
      value: category.id,
      label: (labels.get(category.id) ?? category.name) + (category.retired ? ' (retired)' : ''),
      group,
      leading: <CategoryChip icon={category.icon} color={category.color} size="sm" />,
    });
    const recentIds = new Set(recent.map((category) => category.id));
    return [
      ...recent.filter((category) => eligible.includes(category)).map((c) => toOption(c, 'Recent')),
      ...eligible
        .filter((category) => !recentIds.has(category.id))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((category) => toOption(category, recent.length > 0 ? 'All categories' : '')),
    ].map((option) =>
      option.group === '' ? { ...option, group: undefined } : option,
    ) as ComboboxOption[];
  }, [categories, recent, type, value]);
  return (
    <Combobox
      {...rest}
      options={options}
      value={value}
      onChange={onChange}
      emptyText={`You have no ${type} categories.`}
    />
  );
}

/** Up to four recent categories as pressable chips; one tap picks it. */
export function RecentCategoryChips({
  recent,
  value,
  onPick,
  className,
}: {
  recent: readonly Category[];
  value: string | null;
  onPick: (id: string) => void;
  className?: string;
}) {
  if (recent.length === 0) return null;
  return (
    <div
      role="group"
      aria-label="Recent categories"
      className={cn('flex flex-wrap items-center gap-2', className)}
    >
      <span className="text-caption text-ink-3">Recent</span>
      {recent.slice(0, 4).map((category) => (
        <button
          key={category.id}
          type="button"
          aria-pressed={value === category.id}
          onClick={() => onPick(category.id)}
          className={cn(
            'inline-flex min-h-9 items-center rounded-md border px-2 pointer-coarse:min-h-11',
            value === category.id
              ? 'border-primary bg-primary-tint'
              : 'border-line-strong bg-surface hover:bg-sunken',
          )}
        >
          <CategoryChip
            icon={category.icon}
            color={category.color}
            size="sm"
            name={category.name}
          />
        </button>
      ))}
    </div>
  );
}

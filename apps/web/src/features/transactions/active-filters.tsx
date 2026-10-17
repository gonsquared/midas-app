import type { Category, Wallet } from '@midas/shared';
import { X } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { formatLocalDate } from '@/lib/dates';
import { formatMinor } from '@/lib/money';
import { usePreferences } from '@/lib/preferences';
import { amountFilterCurrency, type TransactionFilters } from './filters';
import type { FilterPatch } from './filter-panels';

interface Chip {
  key: string;
  label: string;
  name: string;
  remove: FilterPatch;
}

export function buildChips(
  filters: TransactionFilters,
  wallets: readonly Wallet[],
  categories: readonly Category[],
  locale: string,
): Chip[] {
  const chips: Chip[] = [];
  const fmt = (v: string) =>
    formatLocalDate(v, locale, { day: 'numeric', month: 'short', year: 'numeric' });
  if (filters.from || filters.to) {
    const text =
      filters.from && filters.to
        ? `${fmt(filters.from)} to ${fmt(filters.to)}`
        : filters.from
          ? `From ${fmt(filters.from)}`
          : `Until ${fmt(filters.to as string)}`;
    chips.push({
      key: 'dates',
      label: text,
      name: `Dates ${text}`,
      remove: { from: undefined, to: undefined },
    });
  }
  for (const id of filters.wallet) {
    const name = wallets.find((wallet) => wallet.id === id)?.name ?? 'Unavailable wallet';
    chips.push({
      key: `wallet-${id}`,
      label: name,
      name: `Wallet ${name}`,
      remove: { wallet: filters.wallet.filter((item) => item !== id) },
    });
  }
  for (const id of filters.category) {
    const name = categories.find((category) => category.id === id)?.name ?? 'Unavailable category';
    chips.push({
      key: `category-${id}`,
      label: name,
      name: `Category ${name}`,
      remove: { category: filters.category.filter((item) => item !== id) },
    });
  }
  for (const type of filters.type) {
    const label = type[0]!.toUpperCase() + type.slice(1);
    chips.push({
      key: `type-${type}`,
      label,
      name: `Type ${label}`,
      remove: { type: filters.type.filter((item) => item !== type) },
    });
  }
  if (filters.min !== undefined || filters.max !== undefined) {
    const currency = amountFilterCurrency(filters, wallets) ?? 'USD';
    const lo = filters.min !== undefined ? formatMinor(filters.min, currency, locale) : 'any';
    const hi = filters.max !== undefined ? formatMinor(filters.max, currency, locale) : 'any';
    chips.push({
      key: 'amount',
      label: `${lo} to ${hi}`,
      name: `Amount ${lo} to ${hi}`,
      remove: { min: undefined, max: undefined },
    });
  }
  return chips;
}

export function ActiveFilters({
  filters,
  wallets,
  categories,
  onChange,
  onClearAll,
  onRemoved,
}: {
  filters: TransactionFilters;
  wallets: readonly Wallet[];
  categories: readonly Category[];
  onChange: (patch: FilterPatch) => void;
  onClearAll: () => void;
  onRemoved?: (name: string) => void;
}) {
  const { locale } = usePreferences();
  const chips = buildChips(filters, wallets, categories, locale);
  const focusIndex = useRef<number | null>(null);

  // After a chip is removed, focus the chip that took its place, the one before, or the search.
  useLayoutEffect(() => {
    if (focusIndex.current === null) return;
    const buttons = document.querySelectorAll<HTMLElement>('[data-filter-chip]');
    const target = buttons[focusIndex.current] ?? buttons[buttons.length - 1];
    (target ?? document.getElementById('tx-search'))?.focus();
    focusIndex.current = null;
  }, [chips.length]);

  if (chips.length === 0) return null;
  return (
    <ul aria-label="Active filters" className="m-0 flex list-none flex-wrap items-center gap-2 p-0">
      {chips.map((chip, index) => (
        <li key={chip.key}>
          <button
            type="button"
            data-filter-chip
            aria-label={`Remove filter: ${chip.name}`}
            onClick={() => {
              focusIndex.current = index;
              onChange(chip.remove);
              onRemoved?.(chip.name);
            }}
            className="inline-flex min-h-8 items-center gap-1 rounded-full border border-line-strong bg-surface px-3 text-body-sm hover:bg-sunken pointer-coarse:min-h-11"
          >
            <span dir="auto">{chip.label}</span>
            <X aria-hidden="true" className="size-3.5" />
          </button>
        </li>
      ))}
      {chips.length >= 2 ? (
        <li>
          <Button variant="link" className="text-body-sm" onClick={onClearAll}>
            Clear all
          </Button>
        </li>
      ) : null}
    </ul>
  );
}

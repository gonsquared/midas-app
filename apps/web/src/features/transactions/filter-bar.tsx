import type { Category, Wallet } from '@midas/shared';
import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/cn';
import { formatLocalDate, todayLocalDate } from '@/lib/dates';
import { formatMinor } from '@/lib/money';
import { usePreferences } from '@/lib/preferences';
import {
  amountFilterCurrency,
  countActiveFilters,
  DEFAULT_SORT,
  type TransactionFilters,
} from './filters';
import {
  AmountPanel,
  CategoriesPanel,
  DatesPanel,
  SortSelect,
  TypePanel,
  WalletsPanel,
  type FilterPatch,
} from './filter-panels';

interface BarProps {
  filters: TransactionFilters;
  wallets: readonly Wallet[];
  categories: readonly Category[];
  onChange: (patch: FilterPatch) => void;
  /** Replace every filter at once (Clear all, the mobile sheet's Show results). */
  onReplace: (next: TransactionFilters) => void;
  isMobile: boolean;
}

/** Debounced search box (300ms, or immediately on Enter); Esc clears it. */
export function SearchField({ value, onSearch }: { value: string; onSearch: (q: string) => void }) {
  const [text, setText] = useState(value);
  const timer = useRef<number | undefined>(undefined);
  /** True while the user has typed something that is not committed yet. */
  const pending = useRef(false);
  // Follow the URL only when it differs from what the user typed (a trailing space or a pending
  // debounce must not be overwritten by an echo of the previous commit).
  useEffect(() => {
    if (pending.current) return;
    setText((current) => (current.trim() === value ? current : value));
  }, [value]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const commit = (next: string) => {
    window.clearTimeout(timer.current);
    pending.current = false;
    onSearch(next.trim().slice(0, 100));
  };
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-sm">
      <label htmlFor="tx-search" className="text-body-sm font-medium text-ink-2">
        Search notes
      </label>
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
        />
        <input
          id="tx-search"
          type="search"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          value={text}
          aria-describedby="tx-search-help"
          onChange={(event) => {
            setText(event.target.value);
            window.clearTimeout(timer.current);
            pending.current = true;
            timer.current = window.setTimeout(() => commit(event.target.value), 300);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit(text);
            } else if (event.key === 'Escape' && text) {
              event.preventDefault();
              setText('');
              commit('');
            }
          }}
          className="h-10 w-full rounded-sm border border-line-strong bg-surface pr-10 pl-9 text-body focus-visible:border-ink pointer-coarse:h-11 [&::-webkit-search-cancel-button]:hidden"
        />
        {text ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setText('');
              commit('');
            }}
            className="absolute top-0 right-0 inline-flex size-10 items-center justify-center text-ink-2 hover:text-ink pointer-coarse:size-11"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        ) : null}
      </div>
      <p id="tx-search-help" className="text-caption text-ink-3">
        Searches notes.
      </p>
    </div>
  );
}

function FilterPopover({
  label,
  active,
  disabledReason,
  children,
  onClear,
}: {
  label: string;
  active: boolean;
  disabledReason?: string | undefined;
  children: ReactNode;
  onClear: () => void;
}) {
  const reasonId = `${label.replace(/\W/g, '')}-reason`;
  if (disabledReason) {
    return (
      <div className="flex flex-col">
        <Button
          variant="secondary"
          size="sm"
          aria-disabled="true"
          aria-describedby={reasonId}
          aria-haspopup="dialog"
        >
          {label}
          <ChevronDown aria-hidden="true" className="size-4" />
        </Button>
        <p id={reasonId} className="max-w-48 text-caption text-ink-3">
          {disabledReason}
        </p>
      </div>
    );
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          aria-haspopup="dialog"
          className={cn(active && 'shadow-[inset_0_-2px_0_var(--color-primary)]')}
        >
          {label}
          <ChevronDown aria-hidden="true" className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label={label}
        className="w-72 max-w-[calc(100vw-1rem)] p-3"
      >
        <div className="flex flex-col gap-3">
          {children}
          <Button variant="link" className="self-start text-body-sm" onClick={onClear}>
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function rangeLabel(filters: TransactionFilters, locale: string): string {
  if (!filters.from && !filters.to) return 'All dates';
  const fmt = (v: string) =>
    formatLocalDate(v, locale, { day: 'numeric', month: 'short', year: 'numeric' });
  if (filters.from && filters.to) return `${fmt(filters.from)} to ${fmt(filters.to)}`;
  return filters.from ? `From ${fmt(filters.from)}` : `Until ${fmt(filters.to as string)}`;
}

function summarize(base: string, names: string[]): string {
  if (names.length === 0) return base;
  return `${base}: ${names[0]}${names.length > 1 ? ` +${names.length - 1}` : ''}`;
}

export function FilterPanelsStack({
  filters,
  wallets,
  categories,
  onChange,
  today,
  locale,
}: Omit<BarProps, 'onReplace' | 'isMobile'> & { today: string; locale: string }) {
  const multi = new Set(wallets.map((wallet) => wallet.currency)).size > 1;
  return (
    <div className="flex flex-col gap-6">
      <DatesPanel filters={filters} onChange={onChange} today={today} />
      <TypePanel filters={filters} onChange={onChange} />
      <WalletsPanel filters={filters} onChange={onChange} wallets={wallets} />
      <CategoriesPanel filters={filters} onChange={onChange} categories={categories} />
      <div>
        <h3 className="mb-2 text-body-sm font-medium text-ink-2">Amount</h3>
        <AmountPanel filters={filters} onChange={onChange} wallets={wallets} locale={locale} />
      </div>
      <SortSelect filters={filters} onChange={onChange} multiCurrency={multi} />
    </div>
  );
}

export function FilterBar(props: BarProps) {
  const { filters, wallets, categories, onChange, onReplace, isMobile } = props;
  const { locale, timezone } = usePreferences();
  const today = todayLocalDate(timezone);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [staged, setStaged] = useState(filters);
  const count = countActiveFilters(filters);
  const multi = new Set(wallets.map((wallet) => wallet.currency)).size > 1;
  const currency = amountFilterCurrency(filters, wallets);

  if (isMobile) {
    return (
      <div role="search" className="flex flex-col gap-3">
        <div className="flex items-end gap-2">
          <SearchField value={filters.q ?? ''} onSearch={(q) => onChange({ q: q || undefined })} />
          <Button
            variant="secondary"
            aria-haspopup="dialog"
            onClick={() => {
              setStaged(filters);
              setSheetOpen(true);
            }}
          >
            <SlidersHorizontal aria-hidden="true" className="size-4" />
            {`Filters (${count})`}
          </Button>
        </div>
        {sheetOpen ? (
          <Dialog open onOpenChange={(open) => !open && setSheetOpen(false)}>
            <DialogContent title="Filters" variant="sheet" className="max-h-[92dvh]">
              <FilterPanelsStack
                filters={staged}
                wallets={wallets}
                categories={categories}
                today={today}
                locale={locale}
                onChange={(patch) => setStaged((current) => ({ ...current, ...patch }))}
              />
              <div className="sticky bottom-0 -mx-5 flex flex-col gap-2 border-t border-line bg-raised p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                <Button
                  onClick={() => {
                    onReplace({ ...staged, ...(filters.q ? { q: filters.q } : {}) });
                    setSheetOpen(false);
                  }}
                >
                  Show results
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    setStaged({
                      wallet: [],
                      category: [],
                      type: [],
                      sort: DEFAULT_SORT,
                      ...(filters.q ? { q: filters.q } : {}),
                    })
                  }
                >
                  Clear all
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>
    );
  }

  const none = { wallet: [], category: [], type: [] } as const;
  return (
    <div role="search" className="flex flex-wrap items-end gap-3">
      <SearchField value={filters.q ?? ''} onSearch={(q) => onChange({ q: q || undefined })} />
      <FilterPopover
        label={rangeLabel(filters, locale)}
        active={Boolean(filters.from || filters.to)}
        onClear={() => onChange({ from: undefined, to: undefined })}
      >
        <DatesPanel filters={filters} onChange={onChange} today={today} />
      </FilterPopover>
      <FilterPopover
        label={summarize(
          'Wallets',
          filters.wallet.map(
            (id) => wallets.find((w) => w.id === id)?.name ?? 'Unavailable wallet',
          ),
        )}
        active={filters.wallet.length > 0}
        onClear={() => onChange({ wallet: [...none.wallet] })}
      >
        <WalletsPanel filters={filters} onChange={onChange} wallets={wallets} />
      </FilterPopover>
      <FilterPopover
        label={
          filters.category.length > 0 ? `Categories: ${filters.category.length}` : 'Categories'
        }
        active={filters.category.length > 0}
        onClear={() => onChange({ category: [...none.category] })}
      >
        <CategoriesPanel filters={filters} onChange={onChange} categories={categories} />
      </FilterPopover>
      <FilterPopover
        label={summarize(
          'Type',
          filters.type.map((t) => t[0]!.toUpperCase() + t.slice(1)),
        )}
        active={filters.type.length > 0}
        onClear={() => onChange({ type: [...none.type] })}
      >
        <TypePanel filters={filters} onChange={onChange} />
      </FilterPopover>
      <FilterPopover
        label={
          filters.min !== undefined || filters.max !== undefined
            ? `Amount: ${filters.min !== undefined && currency ? formatMinor(filters.min, currency, locale) : 'any'} to ${filters.max !== undefined && currency ? formatMinor(filters.max, currency, locale) : 'any'}`
            : 'Amount'
        }
        active={filters.min !== undefined || filters.max !== undefined}
        disabledReason={
          currency ? undefined : 'Choose wallets in one currency to filter by amount.'
        }
        onClear={() => onChange({ min: undefined, max: undefined })}
      >
        <AmountPanel filters={filters} onChange={onChange} wallets={wallets} locale={locale} />
      </FilterPopover>
      <div className="w-44">
        <SortSelect filters={filters} onChange={onChange} multiCurrency={multi} />
      </div>
    </div>
  );
}

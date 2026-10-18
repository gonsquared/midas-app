import type { TransactionSort, TransactionType } from '@midas/shared';
import { MAX_AMOUNT_MINOR, isValidLocalDate } from '@midas/shared/money';
import { TRANSACTION_SORTS } from '@midas/shared/transactions';
import { TRANSACTION_TYPES } from '@midas/shared/enums';
import { isUuid } from '@/lib/uuid';

/** Filters as the UI uses them (ui-design 18.3.2). Defaults are omitted from the URL. */
export interface TransactionFilters {
  from?: string;
  to?: string;
  wallet: string[];
  category: string[];
  type: TransactionType[];
  q?: string;
  min?: number;
  max?: number;
  sort: TransactionSort;
}

export type ComposeType = 'expense' | 'income' | 'transfer';

/** What the route keeps in the URL: filters plus the composer and detail overlays. */
export interface TransactionsSearch {
  from?: string;
  to?: string;
  wallet?: string[];
  category?: string[];
  type?: TransactionType[];
  q?: string;
  min?: number;
  max?: number;
  sort?: TransactionSort;
  compose?: ComposeType;
  tx?: string;
}

export const DEFAULT_SORT: TransactionSort = 'date_desc';
const MAX_LIST = 50;

const asList = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(String) : value === undefined ? [] : [String(value)];

function uuidList(value: unknown): string[] {
  return [...new Set(asList(value).filter((item) => isUuid(item)))].slice(0, MAX_LIST);
}

function amount(value: unknown): number | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const text = String(value);
  if (!/^\d{1,15}$/.test(text)) return undefined;
  const parsed = Number(text);
  return parsed >= 1 && parsed <= MAX_AMOUNT_MINOR ? parsed : undefined;
}

/** Validates a raw URL search into a clean TransactionsSearch; invalid pieces are dropped. */
export function parseTransactionsSearch(raw: Record<string, unknown>): TransactionsSearch {
  const result: TransactionsSearch = {};
  const from =
    typeof raw['from'] === 'string' && isValidLocalDate(raw['from']) ? raw['from'] : undefined;
  let to = typeof raw['to'] === 'string' && isValidLocalDate(raw['to']) ? raw['to'] : undefined;
  if (from && to && to < from) to = undefined;
  if (from) result.from = from;
  if (to) result.to = to;
  const wallet = uuidList(raw['wallet']);
  if (wallet.length > 0) result.wallet = wallet;
  const category = uuidList(raw['category']);
  if (category.length > 0) result.category = category;
  const types = [...new Set(asList(raw['type']))].filter((t): t is TransactionType =>
    (TRANSACTION_TYPES as readonly string[]).includes(t),
  );
  if (types.length > 0) result.type = types;
  if (typeof raw['q'] === 'string') {
    const q = raw['q'].trim();
    if (q.length >= 1 && q.length <= 100) result.q = q;
  }
  const min = amount(raw['min']);
  let max = amount(raw['max']);
  if (min !== undefined && max !== undefined && max < min) max = undefined;
  if (min !== undefined) result.min = min;
  if (max !== undefined) result.max = max;
  if ((TRANSACTION_SORTS as readonly string[]).includes(String(raw['sort']))) {
    if (raw['sort'] !== DEFAULT_SORT) result.sort = raw['sort'] as TransactionSort;
  }
  if (
    raw['compose'] === 'expense' ||
    raw['compose'] === 'income' ||
    raw['compose'] === 'transfer'
  ) {
    result.compose = raw['compose'];
  }
  if (isUuid(raw['tx'])) result.tx = raw['tx'];
  return result;
}

const FILTER_KEYS = [
  'from',
  'to',
  'wallet',
  'category',
  'type',
  'q',
  'min',
  'max',
  'sort',
] as const;

/** True when the link carried filter parameters that were ignored as invalid. */
export function hasIgnoredFilters(raw: Record<string, unknown>): boolean {
  const parsed = parseTransactionsSearch(raw) as Record<string, unknown>;
  return FILTER_KEYS.some((key) => {
    const given = raw[key];
    if (given === undefined) return false;
    const kept = parsed[key];
    if (key === 'sort' && given === DEFAULT_SORT) return false;
    if (kept === undefined) return true;
    if (Array.isArray(kept)) return kept.length !== asList(given).length;
    return false;
  });
}

export function toFilters(search: TransactionsSearch): TransactionFilters {
  return {
    ...(search.from ? { from: search.from } : {}),
    ...(search.to ? { to: search.to } : {}),
    wallet: search.wallet ?? [],
    category: search.category ?? [],
    type: search.type ?? [],
    ...(search.q ? { q: search.q } : {}),
    ...(search.min !== undefined ? { min: search.min } : {}),
    ...(search.max !== undefined ? { max: search.max } : {}),
    sort: search.sort ?? DEFAULT_SORT,
  };
}

/** Filters back to URL search (empty values and the default sort are omitted). */
export function filtersToSearch(filters: TransactionFilters): TransactionsSearch {
  return {
    ...(filters.from ? { from: filters.from } : {}),
    ...(filters.to ? { to: filters.to } : {}),
    ...(filters.wallet.length > 0 ? { wallet: filters.wallet } : {}),
    ...(filters.category.length > 0 ? { category: filters.category } : {}),
    ...(filters.type.length > 0 ? { type: filters.type } : {}),
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.min !== undefined ? { min: filters.min } : {}),
    ...(filters.max !== undefined ? { max: filters.max } : {}),
    ...(filters.sort !== DEFAULT_SORT ? { sort: filters.sort } : {}),
  };
}

/**
 * The amount range compares raw minor units, so across mixed currencies it is meaningless. Once
 * wallets are known, drops min/max when the scope is not a single currency.
 */
export function scopeAmountFilter(
  filters: TransactionFilters,
  wallets: readonly { id: string; currency: string }[],
): { filters: TransactionFilters; amountIgnored: boolean } {
  if (filters.min === undefined && filters.max === undefined) {
    return { filters, amountIgnored: false };
  }
  if (amountFilterCurrency(filters, wallets) !== null) return { filters, amountIgnored: false };
  const { min: _min, max: _max, ...rest } = filters;
  return { filters: rest, amountIgnored: true };
}

export function countActiveFilters(filters: TransactionFilters): number {
  return (
    (filters.from || filters.to ? 1 : 0) +
    filters.wallet.length +
    filters.category.length +
    filters.type.length +
    (filters.min !== undefined || filters.max !== undefined ? 1 : 0)
  );
}

export function toApiQuery(filters: TransactionFilters, limit = 25) {
  return {
    ...(filters.from ? { from: filters.from } : {}),
    ...(filters.to ? { to: filters.to } : {}),
    ...(filters.wallet.length > 0 ? { walletId: filters.wallet } : {}),
    ...(filters.category.length > 0 ? { categoryId: filters.category } : {}),
    ...(filters.type.length > 0 ? { type: filters.type } : {}),
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.min !== undefined ? { minAmountMinor: filters.min } : {}),
    ...(filters.max !== undefined ? { maxAmountMinor: filters.max } : {}),
    sort: filters.sort,
    limit,
  };
}

/**
 * The amount filter compares raw minor units across currencies, so it is offered only when the
 * scope is a single currency (ui-design 18.3.5). Returns that currency, or null.
 */
export function amountFilterCurrency(
  filters: Pick<TransactionFilters, 'wallet'>,
  wallets: readonly { id: string; currency: string }[],
): string | null {
  const scope =
    filters.wallet.length > 0 ? wallets.filter((w) => filters.wallet.includes(w.id)) : wallets;
  const currencies = new Set(scope.map((wallet) => wallet.currency));
  return currencies.size === 1 ? ([...currencies][0] ?? null) : null;
}

/**
 * Whether a freshly added transaction would appear under the current filters and sort. Used to
 * tell the user why a new entry is not in the list (ui-design 18.3.4).
 */
export function matchesFilters(
  transaction: {
    type: TransactionType;
    wallet: { id: string };
    category: { id: string } | null;
    occurredOn: string;
    amountMinor: number;
    note: string | null;
  },
  filters: TransactionFilters,
): boolean {
  if (filters.from && transaction.occurredOn < filters.from) return false;
  if (filters.to && transaction.occurredOn > filters.to) return false;
  if (filters.wallet.length > 0 && !filters.wallet.includes(transaction.wallet.id)) return false;
  if (
    filters.category.length > 0 &&
    !(transaction.category && filters.category.includes(transaction.category.id))
  ) {
    return false;
  }
  if (filters.type.length > 0 && !filters.type.includes(transaction.type)) return false;
  if (filters.q && !(transaction.note ?? '').toLowerCase().includes(filters.q.toLowerCase())) {
    return false;
  }
  if (filters.min !== undefined && transaction.amountMinor < filters.min) return false;
  if (filters.max !== undefined && transaction.amountMinor > filters.max) return false;
  return true;
}

/** Day groups for date sorts: consecutive rows with the same occurredOn. */
export function groupByDay<T extends { occurredOn: string }>(
  items: readonly T[],
): Array<{ date: string; items: T[] }> {
  const groups: Array<{ date: string; items: T[] }> = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.date === item.occurredOn) last.items.push(item);
    else groups.push({ date: item.occurredOn, items: [item] });
  }
  return groups;
}

import { describe, expect, it } from 'vitest';
import { uuid } from '@/test/fixtures';
import {
  amountFilterCurrency,
  countActiveFilters,
  filtersToSearch,
  groupByDay,
  hasIgnoredFilters,
  matchesFilters,
  parseTransactionsSearch,
  toApiQuery,
  toFilters,
} from './filters';

const W1 = uuid(1);
const W2 = uuid(2);

describe('parseTransactionsSearch', () => {
  it('normalises a single value to a list and converts amounts to numbers', () => {
    expect(
      parseTransactionsSearch({
        wallet: W1,
        category: [W1, W2],
        type: 'expense',
        q: '  rent ',
        min: '500',
        max: '90000',
        from: '2026-10-01',
        to: '2026-10-31',
        sort: 'amount_desc',
      }),
    ).toEqual({
      wallet: [W1],
      category: [W1, W2],
      type: ['expense'],
      q: 'rent',
      min: 500,
      max: 90000,
      from: '2026-10-01',
      to: '2026-10-31',
      sort: 'amount_desc',
    });
  });

  it('drops invalid pieces instead of failing the page', () => {
    const parsed = parseTransactionsSearch({
      wallet: ['not-a-uuid', W1],
      type: ['expense', 'bogus'],
      from: '2026-02-31',
      q: '',
      min: '-5',
      max: 'abc',
      sort: 'sideways',
      compose: 'steal',
      tx: 'nope',
    });
    expect(parsed).toEqual({ wallet: [W1], type: ['expense'] });
  });

  it('drops an end date before the start and a max below the min', () => {
    expect(parseTransactionsSearch({ from: '2026-10-10', to: '2026-10-01' })).toEqual({
      from: '2026-10-10',
    });
    expect(parseTransactionsSearch({ min: '900', max: '100' })).toEqual({ min: 900 });
  });

  it('keeps overlay parameters and omits the default sort', () => {
    expect(parseTransactionsSearch({ compose: 'transfer', tx: W1, sort: 'date_desc' })).toEqual({
      compose: 'transfer',
      tx: W1,
    });
  });
});

describe('hasIgnoredFilters', () => {
  it('flags links whose filters were partly or wholly invalid', () => {
    expect(hasIgnoredFilters({ type: 'bogus' })).toBe(true);
    expect(hasIgnoredFilters({ wallet: [W1, 'x'] })).toBe(true);
    expect(hasIgnoredFilters({ wallet: W1, type: 'expense', sort: 'date_desc' })).toBe(false);
    expect(hasIgnoredFilters({})).toBe(false);
  });
});

describe('filters <-> search <-> api', () => {
  it('round-trips and builds the API query with repeated ids', () => {
    const search = parseTransactionsSearch({ wallet: [W1, W2], type: 'income', q: 'x', min: '5' });
    const filters = toFilters(search);
    expect(filtersToSearch(filters)).toEqual(search);
    expect(toApiQuery(filters)).toEqual({
      walletId: [W1, W2],
      type: ['income'],
      q: 'x',
      minAmountMinor: 5,
      sort: 'date_desc',
      limit: 25,
    });
    expect(countActiveFilters(filters)).toBe(4);
  });
});

describe('amountFilterCurrency', () => {
  const wallets = [
    { id: W1, currency: 'USD' },
    { id: W2, currency: 'EUR' },
  ];
  it('is available only for a single-currency scope', () => {
    expect(amountFilterCurrency({ wallet: [] }, wallets)).toBeNull();
    expect(amountFilterCurrency({ wallet: [W1] }, wallets)).toBe('USD');
    expect(amountFilterCurrency({ wallet: [W1, W2] }, wallets)).toBeNull();
    expect(amountFilterCurrency({ wallet: [] }, [wallets[0]!])).toBe('USD');
  });
});

describe('matchesFilters and groupByDay', () => {
  const tx = {
    type: 'expense' as const,
    wallet: { id: W1 },
    category: { id: W2 },
    occurredOn: '2026-10-16',
    amountMinor: 5420,
    note: 'Weekly shop',
  };
  const base = toFilters({});

  it('matches when every active filter agrees', () => {
    expect(matchesFilters(tx, base)).toBe(true);
    expect(matchesFilters(tx, { ...base, wallet: [W1], q: 'SHOP', min: 5000, max: 6000 })).toBe(
      true,
    );
  });

  it('does not match when any filter excludes it', () => {
    expect(matchesFilters(tx, { ...base, wallet: [W2] })).toBe(false);
    expect(matchesFilters(tx, { ...base, from: '2026-10-17' })).toBe(false);
    expect(matchesFilters(tx, { ...base, type: ['income'] })).toBe(false);
    expect(matchesFilters(tx, { ...base, q: 'rent' })).toBe(false);
    expect(matchesFilters(tx, { ...base, max: 100 })).toBe(false);
  });

  it('groups consecutive rows by date', () => {
    const groups = groupByDay([
      { occurredOn: '2026-10-16', id: 1 },
      { occurredOn: '2026-10-16', id: 2 },
      { occurredOn: '2026-10-15', id: 3 },
    ]);
    expect(groups.map((g) => [g.date, g.items.length])).toEqual([
      ['2026-10-16', 2],
      ['2026-10-15', 1],
    ]);
  });
});

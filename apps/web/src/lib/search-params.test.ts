import { describe, expect, it } from 'vitest';
import { parseSearch, stringifySearch } from './search-params';

describe('search params', () => {
  it('parses repeated keys into arrays and keeps values as plain strings', () => {
    expect(parseSearch('?wallet=a&wallet=b&q=123&min=500&type=income')).toEqual({
      wallet: ['a', 'b'],
      q: '123',
      min: '500',
      type: 'income',
    });
    expect(parseSearch('')).toEqual({});
  });

  it('never lets hostile keys reach the search object', () => {
    const parsed = parseSearch('?__proto__=x&constructor=y&ok=1');
    expect(Object.keys(parsed)).toEqual(['ok']);
    expect(({} as Record<string, unknown>)['x']).toBeUndefined();
  });

  it('writes arrays as repeated keys and skips empty values', () => {
    expect(
      stringifySearch({ wallet: ['a', 'b'], q: 'rent & bills', min: 500, from: undefined, x: '' }),
    ).toBe('?wallet=a&wallet=b&q=rent+%26+bills&min=500');
    expect(stringifySearch({})).toBe('');
  });

  it('round-trips', () => {
    const search = { category: ['c1'], type: ['expense', 'income'], q: 'a b' };
    const back = parseSearch(stringifySearch(search));
    expect(back).toEqual({ category: 'c1', type: ['expense', 'income'], q: 'a b' });
  });
});

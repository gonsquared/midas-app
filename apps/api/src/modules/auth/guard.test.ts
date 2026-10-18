import { describe, expect, it } from 'vitest';
import { bearerToken, readCookie } from './guard.js';

describe('bearerToken', () => {
  it('extracts a well-formed token, case-insensitive scheme', () => {
    expect(bearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    expect(bearerToken('bearer abc.def.ghi')).toBe('abc.def.ghi');
  });

  it.each([
    undefined,
    '',
    'Bearer',
    'Bearer ',
    'Basic abc',
    'Bearer a b',
    'Bearer a,b',
    `Bearer ${'a'.repeat(3000)}`,
  ])('returns null for %j', (header) => {
    expect(bearerToken(header)).toBeNull();
  });
});

describe('readCookie', () => {
  const token = 'A'.repeat(43);

  it('finds the named cookie among others', () => {
    expect(readCookie(`a=1; midas_rt=${token}; b=2`, 'midas_rt')).toBe(token);
  });

  it('accepts the <sid>.<secret> refresh token format', () => {
    const dotted = `0199c6a8-0000-7000-8000-00000000000a.${token}`;
    expect(readCookie(`midas_rt=${dotted}`, 'midas_rt')).toBe(dotted);
  });

  it('ignores cookies with similar names and malformed values', () => {
    expect(readCookie(`xmidas_rt=${token}`, 'midas_rt')).toBeUndefined();
    expect(readCookie('midas_rt=short', 'midas_rt')).toBeUndefined();
    expect(readCookie('midas_rt=bad value!', 'midas_rt')).toBeUndefined();
    expect(readCookie(undefined, 'midas_rt')).toBeUndefined();
  });
});

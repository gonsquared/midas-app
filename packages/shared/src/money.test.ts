import { describe, expect, it } from 'vitest';
import {
  AmountMinorSchema,
  isValidLocalDate,
  LocalDateSchema,
  NoteSchema,
  SignedAmountMinorSchema,
} from './money.js';

describe('AmountMinorSchema', () => {
  it.each([1, 100, 100_000_000_000_000])('accepts %s', (value) => {
    expect(AmountMinorSchema.safeParse(value).success).toBe(true);
  });
  it.each([0, -1, 1.5, 100_000_000_000_001, '5', null, Number.NaN, Infinity])(
    'rejects %s',
    (value) => {
      expect(AmountMinorSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe('SignedAmountMinorSchema', () => {
  it('accepts the signed range and rejects beyond it', () => {
    expect(SignedAmountMinorSchema.safeParse(-100_000_000_000_000).success).toBe(true);
    expect(SignedAmountMinorSchema.safeParse(0).success).toBe(true);
    expect(SignedAmountMinorSchema.safeParse(-100_000_000_000_001).success).toBe(false);
  });
});

describe('LocalDateSchema', () => {
  it.each(['1900-01-01', '2100-12-31', '2024-02-29', '2026-10-17'])('accepts %s', (value) => {
    expect(isValidLocalDate(value)).toBe(true);
    expect(LocalDateSchema.safeParse(value).success).toBe(true);
  });
  it.each([
    '1899-12-31',
    '2101-01-01',
    '2023-02-29',
    '2026-13-01',
    '2026-00-10',
    '2026-1-1',
    '2026-10-17T00:00:00Z',
    ' 2026-10-17',
    '',
  ])('rejects %j', (value) => {
    expect(LocalDateSchema.safeParse(value).success).toBe(false);
  });
});

describe('NoteSchema', () => {
  it('trims and keeps multi-line text', () => {
    expect(NoteSchema.parse('  lunch\nwith team ')).toBe('lunch\nwith team');
  });
  it('turns an empty or blank note into null', () => {
    expect(NoteSchema.parse('')).toBeNull();
    expect(NoteSchema.parse('   ')).toBeNull();
  });
  it('accepts 500 characters and rejects 501', () => {
    expect(NoteSchema.safeParse('a'.repeat(500)).success).toBe(true);
    expect(NoteSchema.safeParse('a'.repeat(501)).success).toBe(false);
  });
  it('rejects NUL and other control characters', () => {
    expect(NoteSchema.safeParse('bad\u0000note').success).toBe(false);
    expect(NoteSchema.safeParse('bad\u0007note').success).toBe(false);
    expect(NoteSchema.safeParse('bidi‮override').success).toBe(false);
  });
});

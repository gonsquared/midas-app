import { describe, expect, it } from 'vitest';
import { sanitizeAuditMetadata } from './metadata.js';

describe('sanitizeAuditMetadata (ADR-018)', () => {
  it('keeps small facts such as ids, counts, flags and field names', () => {
    const input = {
      from: 'user',
      to: 'admin',
      fields: ['name', 'icon'],
      sessionsRevoked: 2,
      hasReason: true,
    };
    expect(sanitizeAuditMetadata(input)).toEqual(input);
  });

  it('drops keys that look like secrets or financial details, at any depth', () => {
    const cleaned = sanitizeAuditMetadata({
      password: 'x',
      newPassword: 'x',
      refreshToken: 'x',
      accessToken: 'x',
      secret: 'x',
      authorization: 'Bearer x',
      cookie: 'x',
      amountMinor: 100,
      note: 'lunch',
      balance: 5,
      nested: { passwordHash: 'x', ok: 1 },
      safe: 'yes',
    });
    expect(cleaned).toEqual({ nested: { ok: 1 }, safe: 'yes' });
  });

  it('truncates long strings and refuses an oversized payload', () => {
    const long = sanitizeAuditMetadata({ text: 'a'.repeat(500) });
    expect((long.text as string).length).toBe(200);
    const entries = Array.from({ length: 40 }, (_, i) => [`k${i}`, 'v'.repeat(190)]);
    expect(sanitizeAuditMetadata(Object.fromEntries(entries))).toEqual({ truncated: true });
  });

  it('returns an empty object for no metadata and ignores functions and undefined', () => {
    expect(sanitizeAuditMetadata(undefined)).toEqual({});
    expect(sanitizeAuditMetadata({ a: undefined, b: () => 1 })).toEqual({});
  });
});

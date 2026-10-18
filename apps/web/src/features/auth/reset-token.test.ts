import { describe, expect, it } from 'vitest';
import { readResetToken } from './reset-token';

const TOKEN = 'abcDEF123_-abcDEF123_-abcDEF123_-abcDEF1234';

describe('readResetToken', () => {
  it('reads a well-formed token with or without the leading hash', () => {
    expect(readResetToken(`#token=${TOKEN}`)).toBe(TOKEN);
    expect(readResetToken(`token=${TOKEN}`)).toBe(TOKEN);
  });

  it('rejects missing, empty, oversized and oddly-shaped tokens', () => {
    expect(readResetToken('')).toBeNull();
    expect(readResetToken('#token=')).toBeNull();
    expect(readResetToken('#other=abc')).toBeNull();
    expect(readResetToken(`#token=${'a'.repeat(300)}`)).toBeNull();
    expect(readResetToken('#token=has spaces and <script>')).toBeNull();
    expect(readResetToken('#token=short')).toBeNull();
  });
});

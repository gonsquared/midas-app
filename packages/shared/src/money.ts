import { z } from 'zod';

/** Largest absolute amount in minor units (api-contract 1.3, ADR-009). */
export const MAX_AMOUNT_MINOR = 100_000_000_000_000;

/** Positive integer minor units, 1 to 10^14. */
export const AmountMinorSchema = z.number().int().min(1).max(MAX_AMOUNT_MINOR);

/** Signed integer minor units, -10^14 to 10^14 (balances and opening balances). */
export const SignedAmountMinorSchema = z
  .number()
  .int()
  .min(-MAX_AMOUNT_MINOR)
  .max(MAX_AMOUNT_MINOR);

const LOCAL_DATE_SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/;
export const LOCAL_DATE_MIN = '1900-01-01';
export const LOCAL_DATE_MAX = '2100-12-31';

/** True when `value` is a real calendar date `YYYY-MM-DD` inside 1900-01-01..2100-12-31. */
export function isValidLocalDate(value: string): boolean {
  const match = LOCAL_DATE_SHAPE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (value < LOCAL_DATE_MIN || value > LOCAL_DATE_MAX) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** Calendar date with no time component (ADR-017). */
export const LocalDateSchema = z.string().refine(isValidLocalDate, {
  message: 'Must be a valid calendar date (YYYY-MM-DD) between 1900-01-01 and 2100-12-31.',
});

/**
 * Free-text note: trimmed, 1 to 500 characters, an empty string becomes null. Control characters
 * other than tab and newline are rejected (NUL is not storable in PostgreSQL text).
 */
const FORMAT_CHARS = /\p{Cf}/u;
function hasForbiddenNoteChars(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    const isControl = code < 0x20 || (code >= 0x7f && code <= 0x9f);
    if (isControl && code !== 0x09 && code !== 0x0a && code !== 0x0d) return true;
  }
  return FORMAT_CHARS.test(value);
}
export const NOTE_MAX_LENGTH = 500;
export const NoteSchema = z
  .string()
  .max(NOTE_MAX_LENGTH * 2)
  .transform((value) => value.trim())
  .pipe(
    z
      .string()
      .max(NOTE_MAX_LENGTH)
      .refine((value) => !hasForbiddenNoteChars(value), {
        message: 'Must not contain control or invisible formatting characters.',
      }),
  )
  .transform((value) => (value === '' ? null : value));

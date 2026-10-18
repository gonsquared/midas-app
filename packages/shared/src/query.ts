import { z } from 'zod';

/** `true` / `false` query-string booleans. */
export const booleanQuery = z.preprocess((value) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}, z.boolean());

/** Non-negative decimal integer in a query string (no signs, exponents or whitespace). */
export const integerQuery = z
  .string()
  .regex(/^\d{1,16}$/, 'Must be a whole number.')
  .transform(Number);

/** Repeated keys (`?a=1&a=2`) arrive as an array and a single key as a string; both become an array. */
export function repeatable<T extends z.ZodType>(item: T, max = 50) {
  return z.preprocess(
    (value) => (value === undefined || Array.isArray(value) ? value : [value]),
    z.array(item).min(1).max(max),
  );
}

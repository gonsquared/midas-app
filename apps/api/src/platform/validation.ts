import type { z } from 'zod';
import { validationError } from './errors.js';

/** Parses untrusted input with a strict schema; any failure becomes 400 VALIDATION_FAILED. */
export function parseInput<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw validationError(result.error);
  return result.data;
}

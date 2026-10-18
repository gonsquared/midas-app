import { z } from 'zod';

export const CURSOR_LIMIT_DEFAULT = 25;
export const CURSOR_LIMIT_MAX = 100;

/** Cursor pagination query (api-contract 1.4). `limit` is coerced from the query string. */
export const CursorQueryShape = {
  limit: z.coerce.number().int().min(1).max(CURSOR_LIMIT_MAX).default(CURSOR_LIMIT_DEFAULT),
  cursor: z.string().min(1).max(512).optional(),
};

export function cursorPage<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() });
}

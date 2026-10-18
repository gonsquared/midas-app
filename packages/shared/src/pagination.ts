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

export const OFFSET_PAGE_SIZE_DEFAULT = 25;
export const OFFSET_PAGE_SIZE_MAX = 100;
/** Deepest page offered (1000 x 100 = 100k rows): deeper offsets are a scan and an abuse vector. Narrow with filters instead. */
export const OFFSET_PAGE_MAX = 1000;

/** Offset pagination query (api-contract 1.4). */
export const OffsetQueryShape = {
  page: z.coerce.number().int().min(1).max(OFFSET_PAGE_MAX).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(OFFSET_PAGE_SIZE_MAX)
    .default(OFFSET_PAGE_SIZE_DEFAULT),
};

export function offsetPage<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    page: z.number().int(),
    pageSize: z.number().int(),
    totalItems: z.number().int(),
    totalPages: z.number().int(),
  });
}

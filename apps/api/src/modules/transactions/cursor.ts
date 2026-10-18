import { createHash } from 'node:crypto';
import {
  AmountMinorSchema,
  LocalDateSchema,
  TRANSACTION_SORTS,
  type ListTransactionsQuery,
  type TransactionSort,
} from '@midas/shared';
import { z } from 'zod';
import { AppError } from '../../platform/errors.js';

/**
 * Keyset cursor (database design 7.8). Opaque base64url JSON holding the sort key of the last
 * row, plus the sort and a hash of the filters, so a cursor from another query is rejected.
 * It is not signed: it can only move the reader inside their own, already user-scoped result,
 * and every value is validated and bound as a query parameter.
 */
const PayloadSchema = z.strictObject({
  v: z.literal(1),
  s: z.enum(TRANSACTION_SORTS),
  f: z.string().length(22),
  // Sort key: occurred_on (date sorts) or amount_minor (amount sorts), created_at, id.
  k: z.tuple([z.union([LocalDateSchema, AmountMinorSchema]), z.iso.datetime(), z.uuid()]),
});

export interface CursorKey {
  /** occurred_on for date sorts, amount_minor for amount sorts. */
  primary: string | number;
  createdAt: string;
  id: string;
}

type FilterFields = Pick<
  ListTransactionsQuery,
  'from' | 'to' | 'walletId' | 'categoryId' | 'type' | 'q' | 'minAmountMinor' | 'maxAmountMinor'
>;

/** Canonical hash of the filters: array order does not matter. */
export function filterHash(filters: FilterFields): string {
  const canonical = JSON.stringify([
    filters.from ?? null,
    filters.to ?? null,
    [...(filters.walletId ?? [])].sort(),
    [...(filters.categoryId ?? [])].sort(),
    [...(filters.type ?? [])].sort(),
    filters.q ?? null,
    filters.minAmountMinor ?? null,
    filters.maxAmountMinor ?? null,
  ]);
  return createHash('sha256').update(canonical).digest('base64url').slice(0, 22);
}

export function encodeCursor(sort: TransactionSort, filters: FilterFields, key: CursorKey): string {
  const payload = {
    v: 1,
    s: sort,
    f: filterHash(filters),
    k: [key.primary, key.createdAt, key.id],
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function invalidCursor(): AppError {
  return new AppError('INVALID_CURSOR', 'The pagination cursor is invalid for this query.');
}

export function decodeCursor(
  cursor: string,
  sort: TransactionSort,
  filters: FilterFields,
): CursorKey {
  let raw: unknown;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error('shape');
    raw = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw invalidCursor();
  }
  const parsed = PayloadSchema.safeParse(raw);
  if (!parsed.success) throw invalidCursor();
  const { s, f, k } = parsed.data;
  if (s !== sort || f !== filterHash(filters)) throw invalidCursor();
  // The primary key must match the sort kind: a date for date sorts, an integer for amount sorts.
  const isDateSort = sort.startsWith('date');
  if (isDateSort !== (typeof k[0] === 'string')) throw invalidCursor();
  return { primary: k[0], createdAt: k[1], id: k[2] };
}

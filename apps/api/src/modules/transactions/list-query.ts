import type { ListTransactionsQuery } from '@midas/shared';
import { sql } from 'kysely';
import type { DbHandle } from '../../platform/db/client.js';
import { decodeCursor, encodeCursor, type CursorKey } from './cursor.js';
import { escapeLike, selectTransactionRows, type TransactionRow } from './repository.js';

/** The filters and sort shared by the list and the CSV export. */
export type TransactionFilters = Pick<
  ListTransactionsQuery,
  | 'from'
  | 'to'
  | 'walletId'
  | 'categoryId'
  | 'type'
  | 'q'
  | 'minAmountMinor'
  | 'maxAmountMinor'
  | 'sort'
>;

function orderingOf(sort: TransactionFilters['sort']) {
  const byAmount = sort === 'amount_desc' || sort === 'amount_asc';
  const descending = sort === 'date_desc' || sort === 'amount_desc';
  return {
    byAmount,
    descending,
    primary: byAmount ? sql.ref('t.amount_minor') : sql.ref('t.occurred_on'),
  };
}

/** Every predicate is bound as a parameter; `q` has its LIKE metacharacters escaped. */
function applyFilters(q: ReturnType<typeof selectTransactionRows>, query: TransactionFilters) {
  if (query.from !== undefined) q = q.where('t.occurredOn', '>=', query.from);
  if (query.to !== undefined) q = q.where('t.occurredOn', '<=', query.to);
  if (query.walletId) q = q.where('t.walletId', 'in', query.walletId);
  if (query.categoryId) q = q.where('t.categoryId', 'in', query.categoryId);
  if (query.type) q = q.where('t.type', 'in', query.type);
  if (query.q !== undefined) {
    q = q.where(sql<boolean>`t.note ilike ${`%${escapeLike(query.q)}%`}`);
  }
  if (query.minAmountMinor !== undefined) q = q.where('t.amountMinor', '>=', query.minAmountMinor);
  if (query.maxAmountMinor !== undefined) q = q.where('t.amountMinor', '<=', query.maxAmountMinor);
  return q;
}

/**
 * The list query without paging, ordered like the list (sort, created_at, id). The CSV export
 * streams it through a server-side cursor instead of paging (AP-08).
 */
export function buildExportQuery(db: DbHandle, userId: string, query: TransactionFilters) {
  const { primary, descending } = orderingOf(query.sort);
  const direction = descending ? 'desc' : 'asc';
  return applyFilters(selectTransactionRows(db, userId), query)
    .orderBy(primary, direction)
    .orderBy('t.createdAt', direction)
    .orderBy('t.id', direction);
}

/**
 * Builds the list query (AP-07). The sort columns end in (created_at, id), the unique tiebreak
 * that makes keyset pages stable. The cursor predicate is a row-value comparison so the planner
 * can walk ix_transactions__user_date or ix_transactions__user_amount directly (database
 * design 7.8).
 */
export function buildListQuery(
  db: DbHandle,
  userId: string,
  query: ListTransactionsQuery,
  after: CursorKey | null,
) {
  let q = applyFilters(selectTransactionRows(db, userId), query);
  const { byAmount, descending, primary } = orderingOf(query.sort);

  if (after) {
    const cast = byAmount ? sql`::bigint` : sql`::date`;
    const op = descending ? sql`<` : sql`>`;
    q = q.where(
      sql<boolean>`(${primary}, t.created_at, t.id) ${op} (${after.primary}${cast}, ${after.createdAt}::timestamptz, ${after.id}::uuid)`,
    );
  }

  const direction = descending ? 'desc' : 'asc';
  return q
    .orderBy(primary, direction)
    .orderBy('t.createdAt', direction)
    .orderBy('t.id', direction)
    .limit(query.limit + 1);
}

export interface TransactionPageRows {
  rows: TransactionRow[];
  nextCursor: string | null;
}

export async function listTransactionRows(
  db: DbHandle,
  userId: string,
  query: ListTransactionsQuery,
): Promise<TransactionPageRows> {
  const after = query.cursor ? decodeCursor(query.cursor, query.sort, query) : null;
  const fetched = await buildListQuery(db, userId, query, after).execute();

  const hasMore = fetched.length > query.limit;
  const rows = hasMore ? fetched.slice(0, query.limit) : fetched;
  const last = rows[rows.length - 1];
  const byAmount = query.sort === 'amount_desc' || query.sort === 'amount_asc';
  const nextCursor =
    hasMore && last
      ? encodeCursor(query.sort, query, {
          primary: byAmount ? last.amountMinor : last.occurredOn,
          createdAt: last.createdAt.toISOString(),
          id: last.id,
        })
      : null;
  return { rows, nextCursor };
}

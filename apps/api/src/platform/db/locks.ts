import { sql } from 'kysely';
import type { DbHandle } from './client.js';

/**
 * Advisory lock namespaces (database design 9.3). Two-integer form, held until the transaction
 * ends, so it works behind a transaction-mode pooler.
 */
export const LOCK_NAMESPACE = {
  walletLimit: 2,
  categoryLimit: 3,
  budgetLimit: 4,
  recurringLimit: 5,
} as const;

/** Admin set (namespace 1, key 0): role and status changes, admin bootstrap and creation (C-06). */
const ADMIN_SET_NAMESPACE = 1;
/** Daily housekeeping (namespace 10, key 0), taken with the try-variant and skipped if busy. */
const HOUSEKEEPING_NAMESPACE = 10;

/** Serializes limit checks per user (for example the 100 wallet cap). Call inside a transaction. */
export async function lockUserScope(
  db: DbHandle,
  namespace: (typeof LOCK_NAMESPACE)[keyof typeof LOCK_NAMESPACE],
  userId: string,
): Promise<void> {
  await sql`select pg_advisory_xact_lock(${namespace}::int, hashtext(${userId}::text))`.execute(db);
}

/**
 * Serializes every change of the set of active admins (C-06): role changes, suspension,
 * reactivation, `admin:create`, `admin:promote` and the boot-time bootstrap. Call first inside
 * the transaction, before any row lock, and count admins only after holding it.
 */
export async function lockAdminSet(db: DbHandle): Promise<void> {
  await sql`select pg_advisory_xact_lock(${ADMIN_SET_NAMESPACE}::int, 0)`.execute(db);
}

/** True when this transaction got the housekeeping lock; another instance is running it otherwise. */
export async function tryLockHousekeeping(db: DbHandle): Promise<boolean> {
  const result = await sql<{
    locked: boolean;
  }>`select pg_try_advisory_xact_lock(${HOUSEKEEPING_NAMESPACE}::int, 0) as locked`.execute(db);
  return result.rows[0]?.locked === true;
}

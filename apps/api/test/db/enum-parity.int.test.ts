import {
  CATEGORY_TYPES,
  ROLES,
  THEMES,
  TRANSACTION_TYPES,
  TRANSFER_DIRECTIONS,
  USER_STATUSES,
  WALLET_TYPES,
} from '@midas/shared';
import type pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { describeDb, ownerPool } from '../support/db.js';

// Enum parity (database design notes 11.5 and 16.4): every enum-like CHECK list equals the
// matching @midas/shared enum, so the database and the API cannot drift apart.
const PAIRS: Array<[constraint: string, values: readonly string[]]> = [
  ['ck_users__role', ROLES],
  ['ck_users__status', USER_STATUSES],
  ['ck_users__theme', THEMES],
  ['ck_wallets__type', WALLET_TYPES],
  ['ck_categories__type', CATEGORY_TYPES],
  ['ck_transactions__type', TRANSACTION_TYPES],
  ['ck_transactions__transfer_direction', TRANSFER_DIRECTIONS],
];

describeDb('enum parity between CHECK constraints and @midas/shared', () => {
  let owner: pg.Pool;
  beforeAll(() => {
    owner = ownerPool();
  });
  afterAll(async () => {
    await owner.end();
  });

  it.each(PAIRS)('%s matches the shared enum', async (constraint, values) => {
    const { rows } = await owner.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conname = $1 AND connamespace = 'public'::regnamespace`,
      [constraint],
    );
    expect(rows).toHaveLength(1);
    const listed = [...rows[0]!.def.matchAll(/'([^']*)'::text/g)].map((m) => m[1]);
    expect([...listed].sort()).toEqual([...values].sort());
  });
});

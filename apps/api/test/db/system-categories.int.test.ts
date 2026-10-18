import { AuthSessionSchema } from '@midas/shared';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import {
  SeedValidationError,
  SYSTEM_CATEGORIES,
  seedSystemCategories,
  validateSystemCategories,
} from '../../db/seeds/system-categories.js';
import { buildApp } from '../../src/app.js';
import { createKysely, type DatabaseClient } from '../../src/platform/db/client.js';
import type { Database } from '../../src/platform/db/database.js';
import { testConfig } from '../support/app.js';
import { appClient, dbTestInfo, describeDb, truncateAll } from '../support/db.js';

// E4-F1-S1 (database design notes 12.1): system categories are seeded idempotently, shared by
// every user (owner_user_id IS NULL), and never copied per user. Also covers E2-F2-S1 criterion
// "new users get default categories available".

describeDb('seed:system (real PostgreSQL)', () => {
  let pool: pg.Pool;
  let db: Kysely<Database>;

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: dbTestInfo()!.ownerUrl, max: 4 });
    db = createKysely(pool);
  });
  afterAll(async () => {
    await db.destroy();
  });
  // truncateAll runs the seed once, as every test database starts seeded.
  beforeEach(async () => {
    await truncateAll(pool);
  });

  const snapshot = () =>
    db
      .selectFrom('categories')
      .select(['id', 'systemKey', 'name', 'type', 'icon', 'color', 'ownerUserId', 'retiredAt'])
      .orderBy('systemKey')
      .execute();

  it('inserts 8 income and 21 expense system categories, all shared (owner null)', async () => {
    const rows = await snapshot();
    expect(rows).toHaveLength(SYSTEM_CATEGORIES.length);
    expect(rows.filter((r) => r.type === 'income')).toHaveLength(8);
    expect(rows.filter((r) => r.type === 'expense')).toHaveLength(21);
    expect(rows.every((r) => r.ownerUserId === null && r.retiredAt === null)).toBe(true);
    const groceries = rows.find((r) => r.systemKey === 'expense.groceries');
    expect(groceries).toMatchObject({ name: 'Groceries', icon: 'shopping-cart', color: 'green' });
    // Application-generated UUIDv7 ids (database design notes 4.2).
    expect(groceries?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
  });

  it('is idempotent: rerunning inserts nothing and changes nothing', async () => {
    const before = await snapshot();
    const result = await seedSystemCategories(db);
    expect(result).toEqual({
      inserted: [],
      existing: SYSTEM_CATEGORIES.map((c) => c.systemKey),
      nameCollisions: [],
    });
    expect(await snapshot()).toEqual(before);
  });

  it('never overwrites admin edits, never un-retires, and restores a deleted default', async () => {
    await db
      .updateTable('categories')
      .set({ name: 'Food shopping', color: 'lime' })
      .where('systemKey', '=', 'expense.groceries')
      .execute();
    await db
      .updateTable('categories')
      .set({ retiredAt: new Date() })
      .where('systemKey', '=', 'expense.fuel')
      .execute();
    await db.deleteFrom('categories').where('systemKey', '=', 'expense.pets').execute();

    const result = await seedSystemCategories(db);
    expect(result.inserted).toEqual(['expense.pets']);

    const rows = await snapshot();
    expect(rows.find((r) => r.systemKey === 'expense.groceries')).toMatchObject({
      name: 'Food shopping',
      color: 'lime',
    });
    expect(rows.find((r) => r.systemKey === 'expense.fuel')?.retiredAt).toBeInstanceOf(Date);
    expect(rows).toHaveLength(SYSTEM_CATEGORIES.length);
  });

  it('skips a default whose name an admin already used, with a warning', async () => {
    await db.deleteFrom('categories').where('systemKey', '=', 'expense.kids').execute();
    await db
      .insertInto('categories')
      .values({ name: 'kids', type: 'expense', icon: 'baby', color: 'pink' })
      .execute();
    const logger = { info: vi.fn(), warn: vi.fn() };

    const result = await seedSystemCategories(db, { logger });
    expect(result.nameCollisions).toEqual(['expense.kids']);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('expense.kids'));
  });

  it('handles concurrent runs without duplicates', async () => {
    await db.deleteFrom('categories').execute();
    const results = await Promise.all([1, 2, 3].map(() => seedSystemCategories(db)));
    expect(results.reduce((n, r) => n + r.inserted.length, 0)).toBe(SYSTEM_CATEGORIES.length);
    expect(await snapshot()).toHaveLength(SYSTEM_CATEGORIES.length);
  });

  it('validates entries before touching the database', async () => {
    expect(() => validateSystemCategories(SYSTEM_CATEGORIES)).not.toThrow();
    const ok = SYSTEM_CATEGORIES[0]!;
    const bad = [
      { ...ok, systemKey: 'income.new_one', icon: 'not-an-icon' },
      { ...ok, systemKey: 'income.new_two', name: 'Two', color: 'mauve' },
      { ...ok, systemKey: 'expense.wrong_prefix', name: 'Three' },
      { ...ok, systemKey: 'income.salary', name: 'Four' },
      { ...ok, systemKey: 'income.dup_name' },
      { ...ok, systemKey: 'income.padded', name: ' Padded' },
    ];
    await db.deleteFrom('categories').execute();
    let error: unknown;
    try {
      await seedSystemCategories(db, { entries: [ok, ...bad] });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(SeedValidationError);
    const problems = (error as SeedValidationError).problems.join('\n');
    for (const fragment of [
      'not-an-icon',
      'mauve',
      'expense.wrong_prefix',
      'income.salary: duplicate key',
      'income.dup_name: duplicate income name',
      'income.padded',
    ]) {
      expect(problems).toContain(fragment);
    }
    expect(await snapshot()).toEqual([]);
  });

  it('gives a newly registered user the default categories without copying them', async () => {
    const client: DatabaseClient = appClient();
    const app: FastifyInstance = await buildApp({
      config: testConfig({ RATE_LIMIT_ENABLED: 'false' }),
      db: client.db,
      clock: { now: () => new Date() },
    });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'new.user@example.com',
          password: 'correct horse battery staple 42',
          displayName: 'New User',
        },
      });
      expect(res.statusCode).toBe(201);
      const userId = AuthSessionSchema.parse(res.json()).user.id;

      // AP-06 as the application role: system categories plus the user's own.
      const visible = await client.db
        .selectFrom('categories')
        .select(['systemKey', 'type'])
        .where((eb) => eb.or([eb('ownerUserId', 'is', null), eb('ownerUserId', '=', userId)]))
        .where('retiredAt', 'is', null)
        .execute();
      expect(visible).toHaveLength(SYSTEM_CATEGORIES.length);
      const own = await db
        .selectFrom('categories')
        .select('id')
        .where('ownerUserId', '=', userId)
        .execute();
      expect(own).toEqual([]);
    } finally {
      await app.close();
      await client.db.destroy();
    }
  });
});

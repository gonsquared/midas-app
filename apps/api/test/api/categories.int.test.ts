import { CategorySchema, ProblemSchema } from '@midas/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createIntegrationContext, registerUser, type IntegrationContext } from '../support/api.js';
import { describeDb, truncateAll } from '../support/db.js';
import {
  createCategory,
  createTransaction,
  createWallet,
  expectLedgerConsistent,
  systemCategory,
} from '../support/ledger.js';

describeDb('categories API (real PostgreSQL)', () => {
  let ctx: IntegrationContext;

  beforeAll(async () => {
    ctx = await createIntegrationContext();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await truncateAll(ctx.owner);
  });
  // C-01 and C-02 invariants after every test (database design 16.5).
  afterEach(async () => {
    await expectLedgerConsistent(ctx.owner);
  });

  const call = (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    headers: Record<string, string>,
    payload?: unknown,
  ) =>
    ctx.app.inject({
      method,
      url,
      headers,
      ...(payload !== undefined && { payload: payload as object }),
    });

  describe('defaults for new users (E2-F2-S1 criterion 3)', () => {
    it('shows the system categories right after registration without copying them', async () => {
      const user = await registerUser(ctx.app);
      const res = await call('GET', '/api/v1/categories', user.headers);
      expect(res.statusCode).toBe(200);
      const items = res.json<{ items: unknown[] }>().items.map((i) => CategorySchema.parse(i));
      expect(items.length).toBeGreaterThanOrEqual(29);
      expect(items.every((c) => c.system && !c.retired)).toBe(true);
      expect(items.filter((c) => c.type === 'income').length).toBe(8);
      expect(items.map((c) => c.type)).toEqual([...items.map((c) => c.type)].sort());
      expect(items.map((c) => c.name)).toContain('Salary');
      const owned = await ctx.owner.query(
        'select count(*)::int as n from categories where owner_user_id = $1',
        [user.id],
      );
      expect(owned.rows[0].n).toBe(0);
    });

    it('gives a new user default preferences next to the default categories', async () => {
      const user = await registerUser(ctx.app);
      const me = await call('GET', '/api/v1/me', user.headers);
      expect(me.json().preferences).toEqual({
        currency: 'USD',
        locale: 'en-US',
        timezone: 'UTC',
        theme: 'system',
      });
    });
  });

  describe('list and create', () => {
    it('filters by type and hides retired system categories unless asked', async () => {
      const user = await registerUser(ctx.app);
      const salary = await systemCategory(ctx.app, user, 'income', 'Salary');
      await ctx.owner.query('update categories set retired_at = now() where id = $1', [salary.id]);
      const hidden = await call('GET', '/api/v1/categories?type=income', user.headers);
      expect(hidden.json().items.map((c: { name: string }) => c.name)).not.toContain('Salary');
      const shown = await call(
        'GET',
        '/api/v1/categories?type=income&includeRetired=true',
        user.headers,
      );
      const found = shown.json().items.find((c: { name: string }) => c.name === 'Salary');
      expect(found.retired).toBe(true);
      expect(shown.json().items.every((c: { type: string }) => c.type === 'income')).toBe(true);
    });

    it('creates a user category that only its owner can see', async () => {
      const alice = await registerUser(ctx.app);
      const bob = await registerUser(ctx.app);
      const created = await call('POST', '/api/v1/categories', alice.headers, {
        name: 'Coffee',
        type: 'expense',
        icon: 'coffee',
        color: 'brown',
      });
      expect(created.statusCode).toBe(201);
      expect(CategorySchema.parse(created.json())).toMatchObject({ system: false, retired: false });
      const aliceList = await call('GET', '/api/v1/categories?type=expense', alice.headers);
      const bobList = await call('GET', '/api/v1/categories?type=expense', bob.headers);
      expect(aliceList.json().items.map((c: { name: string }) => c.name)).toContain('Coffee');
      expect(bobList.json().items.map((c: { name: string }) => c.name)).not.toContain('Coffee');
    });

    it('enforces name uniqueness per user and type, case-insensitively', async () => {
      const alice = await registerUser(ctx.app);
      const bob = await registerUser(ctx.app);
      await createCategory(ctx.app, alice, { name: 'Pets', type: 'expense' });
      const dup = await call('POST', '/api/v1/categories', alice.headers, {
        name: 'pETS',
        type: 'expense',
        icon: 'tag',
        color: 'blue',
      });
      expect(dup.statusCode).toBe(409);
      expect(ProblemSchema.parse(dup.json()).code).toBe('CATEGORY_NAME_TAKEN');
      const otherType = await call('POST', '/api/v1/categories', alice.headers, {
        name: 'Pets',
        type: 'income',
        icon: 'tag',
        color: 'blue',
      });
      const otherUser = await call('POST', '/api/v1/categories', bob.headers, {
        name: 'Pets',
        type: 'expense',
        icon: 'tag',
        color: 'blue',
      });
      expect(otherType.statusCode).toBe(201);
      expect(otherUser.statusCode).toBe(201);
    });

    it('enforces the 200 category limit', async () => {
      const user = await registerUser(ctx.app);
      await ctx.owner.query(
        `insert into categories (owner_user_id, name, type, icon, color)
         select $1, 'c' || g, 'expense', 'tag', 'blue' from generate_series(1, 200) g`,
        [user.id],
      );
      const res = await call('POST', '/api/v1/categories', user.headers, {
        name: 'one more',
        type: 'expense',
        icon: 'tag',
        color: 'blue',
      });
      expect(res.statusCode).toBe(409);
      expect(ProblemSchema.parse(res.json()).code).toBe('LIMIT_REACHED');
    });

    it.each([
      ['unknown icon', { icon: 'skull-and-crossbones' }],
      ['unknown color', { color: 'ultraviolet' }],
      ['blank name', { name: ' ' }],
      ['long name', { name: 'x'.repeat(41) }],
      ['bad type', { type: 'transfer' }],
      ['owner injection', { ownerUserId: null }],
      ['system injection', { system: true }],
      ['retired injection', { retired: true }],
    ])('rejects %s', async (_n, patch) => {
      const user = await registerUser(ctx.app);
      const res = await call('POST', '/api/v1/categories', user.headers, {
        name: 'Valid',
        type: 'expense',
        icon: 'tag',
        color: 'blue',
        ...patch,
      });
      expect(res.statusCode).toBe(400);
      expect(ProblemSchema.parse(res.json()).code).toBe('VALIDATION_FAILED');
    });
  });

  describe('update', () => {
    it('edits name, icon and color of an own category', async () => {
      const user = await registerUser(ctx.app);
      const cat = await createCategory(ctx.app, user, { name: 'Old' });
      const res = await call('PATCH', `/api/v1/categories/${cat.id}`, user.headers, {
        name: 'New',
        icon: 'car',
        color: 'red',
      });
      expect(res.json()).toMatchObject({ name: 'New', icon: 'car', color: 'red', type: 'expense' });
    });

    it('keeps system categories read-only and hides other users categories', async () => {
      const alice = await registerUser(ctx.app);
      const mallory = await registerUser(ctx.app);
      const system = await systemCategory(ctx.app, alice, 'expense');
      const own = await createCategory(ctx.app, alice);
      const patchSystem = await call('PATCH', `/api/v1/categories/${system.id}`, alice.headers, {
        name: 'Hacked',
      });
      expect(patchSystem.statusCode).toBe(403);
      expect(ProblemSchema.parse(patchSystem.json()).code).toBe('SYSTEM_CATEGORY_READ_ONLY');
      const deleteSystem = await call('DELETE', `/api/v1/categories/${system.id}`, alice.headers);
      expect(deleteSystem.statusCode).toBe(403);
      expect(ProblemSchema.parse(deleteSystem.json()).code).toBe('SYSTEM_CATEGORY_READ_ONLY');
      const stolen = await call('PATCH', `/api/v1/categories/${own.id}`, mallory.headers, {
        name: 'Mine now',
      });
      const stolenDelete = await call('DELETE', `/api/v1/categories/${own.id}`, mallory.headers);
      expect(stolen.statusCode).toBe(404);
      expect(stolenDelete.statusCode).toBe(404);
      const after = await ctx.owner.query('select name from categories where id = $1', [system.id]);
      expect(after.rows[0].name).toBe(system.name);
    });

    it('cannot change the type and rejects duplicate names', async () => {
      const user = await registerUser(ctx.app);
      await createCategory(ctx.app, user, { name: 'Taken' });
      const cat = await createCategory(ctx.app, user, { name: 'Other' });
      const typeChange = await call('PATCH', `/api/v1/categories/${cat.id}`, user.headers, {
        type: 'income',
      });
      expect(typeChange.statusCode).toBe(400);
      const clash = await call('PATCH', `/api/v1/categories/${cat.id}`, user.headers, {
        name: 'taken',
      });
      expect(clash.statusCode).toBe(409);
      expect(ProblemSchema.parse(clash.json()).code).toBe('CATEGORY_NAME_TAKEN');
    });
  });

  describe('delete', () => {
    it('deletes an unused category without needing reassignTo', async () => {
      const user = await registerUser(ctx.app);
      const cat = await createCategory(ctx.app, user);
      const res = await call('DELETE', `/api/v1/categories/${cat.id}`, user.headers);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        reassignedTransactions: 0,
        reassignedTemplates: 0,
        deletedBudgets: 0,
      });
    });

    async function usedCategory() {
      const user = await registerUser(ctx.app);
      const wallet = await createWallet(ctx.app, user);
      const cat = await createCategory(ctx.app, user, { name: 'Used' });
      const target = await createCategory(ctx.app, user, { name: 'Target' });
      for (const note of ['a', 'b']) {
        await createTransaction(ctx.app, user, {
          type: 'expense',
          walletId: wallet.id,
          categoryId: cat.id,
          note,
        });
      }
      return { user, wallet, cat, target };
    }

    it('rejects deleting a used category without reassignTo and changes nothing', async () => {
      const { user, cat } = await usedCategory();
      const res = await call('DELETE', `/api/v1/categories/${cat.id}`, user.headers);
      expect(res.statusCode).toBe(409);
      expect(ProblemSchema.parse(res.json()).code).toBe('CATEGORY_IN_USE');
      const rows = await ctx.owner.query(
        'select count(*)::int as n from categories where id = $1',
        [cat.id],
      );
      expect(rows.rows[0].n).toBe(1);
    });

    it('reassigns transactions to the target and deletes the category', async () => {
      const { user, cat, target } = await usedCategory();
      const res = await call(
        'DELETE',
        `/api/v1/categories/${cat.id}?reassignTo=${target.id}`,
        user.headers,
      );
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ reassignedTransactions: 2, deletedBudgets: 0 });
      const moved = await ctx.owner.query(
        'select count(*)::int as n from transactions where category_id = $1',
        [target.id],
      );
      expect(moved.rows[0].n).toBe(2);
    });

    it('refuses invalid reassignment targets with 422 and keeps everything', async () => {
      const { user, cat } = await usedCategory();
      const mallory = await registerUser(ctx.app);
      const income = await systemCategory(ctx.app, user, 'income');
      const foreign = await createCategory(ctx.app, mallory, { name: 'Foreign' });
      const systemRetired = await systemCategory(ctx.app, user, 'expense', 'Taxes');
      await ctx.owner.query('update categories set retired_at = now() where id = $1', [
        systemRetired.id,
      ]);
      const targets = [
        cat.id,
        income.id,
        foreign.id,
        systemRetired.id,
        '0197f8a0-0000-7000-8000-00000000dead',
      ];
      for (const target of targets) {
        const res = await call(
          'DELETE',
          `/api/v1/categories/${cat.id}?reassignTo=${target}`,
          user.headers,
        );
        expect(res.statusCode).toBe(422);
        expect(ProblemSchema.parse(res.json()).code).toBe('REASSIGN_TARGET_INVALID');
      }
      const still = await ctx.owner.query(
        'select count(*)::int as n from transactions where category_id = $1',
        [cat.id],
      );
      expect(still.rows[0].n).toBe(2);
    });

    it('rejects a malformed reassignTo', async () => {
      const { user, cat } = await usedCategory();
      const res = await call(
        'DELETE',
        `/api/v1/categories/${cat.id}?reassignTo=nope`,
        user.headers,
      );
      expect(res.statusCode).toBe(400);
    });
  });
});

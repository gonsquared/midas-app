import type { CategoryType } from '@midas/shared';
import { sql, type ExpressionBuilder } from 'kysely';
import type { DbHandle } from '../../platform/db/client.js';
import type { Database } from '../../platform/db/database.js';

export interface CategoryRecord {
  id: string;
  ownerUserId: string | null;
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
  retiredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const COLUMNS = [
  'id',
  'ownerUserId',
  'name',
  'type',
  'icon',
  'color',
  'retiredAt',
  'createdAt',
  'updatedAt',
] as const;

export interface CategoryPatch {
  name?: string;
  icon?: string;
  color?: string;
}

export function createCategoriesRepository(db: DbHandle) {
  /** System categories and the own categories of the user: never another user rows. */
  const accessible = (userId: string) => (eb: ExpressionBuilder<Database, 'categories'>) =>
    eb.or([eb('ownerUserId', 'is', null), eb('ownerUserId', '=', userId)]);

  return {
    /** AP-06: a few hundred rows at most, served by the system and owner partial indexes. */
    async list(
      userId: string,
      filter: { type?: CategoryType | undefined; includeRetired: boolean },
    ): Promise<CategoryRecord[]> {
      let query = db.selectFrom('categories').select(COLUMNS).where(accessible(userId));
      if (filter.type !== undefined) query = query.where('type', '=', filter.type);
      if (!filter.includeRetired) query = query.where('retiredAt', 'is', null);
      return query
        .orderBy('type')
        .orderBy(sql`lower(name)`)
        .orderBy('name')
        .orderBy('id')
        .limit(500)
        .execute();
    },

    async findAccessible(userId: string, id: string): Promise<CategoryRecord | null> {
      const row = await db
        .selectFrom('categories')
        .select(COLUMNS)
        .where('id', '=', id)
        .where(accessible(userId))
        .executeTakeFirst();
      return row ?? null;
    },

    /**
     * `findAccessible` under FOR KEY SHARE, the lock the foreign key check takes anyway. Ledger
     * writes take it before they lock a ledger row, so the order is wallets, categories, ledger
     * rows (database design 9.2). It waits for a concurrent delete, and then returns null.
     * Key-share locks never conflict with each other, so shared system rows are not contended.
     */
    async shareAccessible(userId: string, id: string): Promise<CategoryRecord | null> {
      const row = await db
        .selectFrom('categories')
        .select(COLUMNS)
        .where('id', '=', id)
        .where(accessible(userId))
        .forKeyShare()
        .executeTakeFirst();
      return row ?? null;
    },

    /**
     * Locks one of the user's own categories; system rows are never matched, so they are never
     * locked by a user request. `update` (FOR UPDATE) only for delete (C-05): it blocks new
     * references until the delete commits. Edits use FOR NO KEY UPDATE, which lets ledger writes
     * that reference the category proceed.
     */
    async lockOwned(
      userId: string,
      id: string,
      mode: 'update' | 'noKeyUpdate',
    ): Promise<CategoryRecord | null> {
      const query = db
        .selectFrom('categories')
        .select(COLUMNS)
        .where('id', '=', id)
        .where('ownerUserId', '=', userId);
      const row = await (
        mode === 'update' ? query.forUpdate() : query.forNoKeyUpdate()
      ).executeTakeFirst();
      return row ?? null;
    },

    async countOwned(userId: string): Promise<number> {
      const row = await db
        .selectFrom('categories')
        .select(sql<number>`count(*)::int`.as('n'))
        .where('ownerUserId', '=', userId)
        .executeTakeFirstOrThrow();
      return row.n;
    },

    async insert(input: {
      id: string;
      ownerUserId: string;
      name: string;
      type: CategoryType;
      icon: string;
      color: string;
    }): Promise<void> {
      await db.insertInto('categories').values(input).execute();
    },

    async update(id: string, ownerUserId: string, patch: CategoryPatch): Promise<void> {
      const values = {
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.icon !== undefined && { icon: patch.icon }),
        ...(patch.color !== undefined && { color: patch.color }),
      };
      if (Object.keys(values).length === 0) return;
      await db
        .updateTable('categories')
        .set(values)
        .where('id', '=', id)
        .where('ownerUserId', '=', ownerUserId)
        .execute();
    },

    /** AP-12 probe backed by ix_transactions__category_user_date. */
    async isReferencedByTransactions(userId: string, id: string): Promise<boolean> {
      const row = await db
        .selectFrom('transactions')
        .select('id')
        .where('categoryId', '=', id)
        .where('userId', '=', userId)
        .limit(1)
        .executeTakeFirst();
      return row !== undefined;
    },

    async reassignTransactions(userId: string, from: string, to: string): Promise<number> {
      const result = await db
        .updateTable('transactions')
        .set({ categoryId: to })
        .where('categoryId', '=', from)
        .where('userId', '=', userId)
        .executeTakeFirst();
      return Number(result.numUpdatedRows);
    },

    /** AP-12 probe backed by ix_recurring_templates__category_id. */
    async isReferencedByTemplates(userId: string, id: string): Promise<boolean> {
      const row = await db
        .selectFrom('recurringTemplates')
        .select('id')
        .where('categoryId', '=', id)
        .where('userId', '=', userId)
        .limit(1)
        .executeTakeFirst();
      return row !== undefined;
    },

    /**
     * Locks every template that references the category (FOR NO KEY UPDATE, ordered by id). The
     * recurring generator locks a template and then takes a key-share lock on its category;
     * deleting a category must therefore lock templates first, in the same order, or the two
     * deadlock (40P01). Call before `lockOwned`.
     */
    async lockReferencingTemplates(userId: string, id: string): Promise<void> {
      await db
        .selectFrom('recurringTemplates')
        .select('id')
        .where('categoryId', '=', id)
        .where('userId', '=', userId)
        .orderBy('id')
        .forNoKeyUpdate()
        .execute();
    },

    async reassignTemplates(userId: string, from: string, to: string): Promise<number> {
      const result = await db
        .updateTable('recurringTemplates')
        .set({ categoryId: to })
        .where('categoryId', '=', from)
        .where('userId', '=', userId)
        .executeTakeFirst();
      return Number(result.numUpdatedRows);
    },

    /** Budgets scoped to a deleted category go with it (api-contract 7). Returns the count. */
    async deleteBudgets(userId: string, categoryId: string): Promise<number> {
      const rows = await db
        .deleteFrom('budgets')
        .where('categoryId', '=', categoryId)
        .where('userId', '=', userId)
        .returning('id')
        .execute();
      return rows.length;
    },

    // --- System categories (admin only, api-contract 14) ---

    async listSystem(filter: {
      type?: CategoryType | undefined;
      includeRetired: boolean;
    }): Promise<CategoryRecord[]> {
      let query = db.selectFrom('categories').select(COLUMNS).where('ownerUserId', 'is', null);
      if (filter.type !== undefined) query = query.where('type', '=', filter.type);
      if (!filter.includeRetired) query = query.where('retiredAt', 'is', null);
      return query
        .orderBy('type')
        .orderBy(sql`lower(name)`)
        .orderBy('name')
        .orderBy('id')
        .limit(500)
        .execute();
    },

    /** A system category by id; user-owned rows never match, so they look like 404 to admins. */
    async findSystem(id: string): Promise<CategoryRecord | null> {
      const row = await db
        .selectFrom('categories')
        .select(COLUMNS)
        .where('id', '=', id)
        .where('ownerUserId', 'is', null)
        .executeTakeFirst();
      return row ?? null;
    },

    async lockSystem(id: string): Promise<CategoryRecord | null> {
      const row = await db
        .selectFrom('categories')
        .select(COLUMNS)
        .where('id', '=', id)
        .where('ownerUserId', 'is', null)
        .forNoKeyUpdate()
        .executeTakeFirst();
      return row ?? null;
    },

    async insertSystem(input: {
      id: string;
      name: string;
      type: CategoryType;
      icon: string;
      color: string;
    }): Promise<void> {
      await db
        .insertInto('categories')
        .values({ ...input, ownerUserId: null })
        .execute();
    },

    async updateSystem(id: string, patch: CategoryPatch): Promise<void> {
      const values = {
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.icon !== undefined && { icon: patch.icon }),
        ...(patch.color !== undefined && { color: patch.color }),
      };
      if (Object.keys(values).length === 0) return;
      await db
        .updateTable('categories')
        .set(values)
        .where('id', '=', id)
        .where('ownerUserId', 'is', null)
        .execute();
    },

    async setRetiredAt(id: string, retiredAt: Date | null): Promise<void> {
      await db
        .updateTable('categories')
        .set({ retiredAt })
        .where('id', '=', id)
        .where('ownerUserId', 'is', null)
        .execute();
    },

    async delete(id: string, ownerUserId: string): Promise<void> {
      await db
        .deleteFrom('categories')
        .where('id', '=', id)
        .where('ownerUserId', '=', ownerUserId)
        .execute();
    },
  };
}

export type CategoriesRepository = ReturnType<typeof createCategoriesRepository>;

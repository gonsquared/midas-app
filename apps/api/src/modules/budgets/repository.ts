import type { BudgetPeriod, BudgetScope, CategoryType } from '@midas/shared';
import { sql } from 'kysely';
import type { DbHandle } from '../../platform/db/client.js';

export interface BudgetRow {
  id: string;
  scope: BudgetScope;
  categoryId: string | null;
  categoryName: string | null;
  categoryType: CategoryType | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  categoryOwnerId: string | null;
  categoryRetiredAt: Date | null;
  period: BudgetPeriod;
  amountMinor: number;
  currency: string;
  warningThresholdPct: number;
  startDate: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewBudget {
  id: string;
  userId: string;
  scope: BudgetScope;
  categoryId: string | null;
  period: BudgetPeriod;
  amountMinor: number;
  currency: string;
  warningThresholdPct: number;
  startDate: string;
}

export interface BudgetPatch {
  amountMinor?: number;
  warningThresholdPct?: number;
  startDate?: string;
}

export interface SpentRow {
  currency: string;
  categoryId: string | null;
  spentMinor: number;
}

/** Every query is scoped by `user_id`; the category join only adds display fields. */
function selectBudgets(db: DbHandle, userId: string) {
  return db
    .selectFrom('budgets as b')
    .leftJoin('categories as c', 'c.id', 'b.categoryId')
    .select([
      'b.id',
      'b.scope',
      'b.categoryId',
      'c.name as categoryName',
      'c.type as categoryType',
      'c.icon as categoryIcon',
      'c.color as categoryColor',
      'c.ownerUserId as categoryOwnerId',
      'c.retiredAt as categoryRetiredAt',
      'b.period',
      'b.amountMinor',
      'b.currency',
      'b.warningThresholdPct',
      'b.startDate',
      'b.createdAt',
      'b.updatedAt',
    ])
    .where('b.userId', '=', userId);
}

export function createBudgetsRepository(db: DbHandle) {
  return {
    /** At most 200 rows per user (the cap is enforced on create). */
    async list(userId: string): Promise<BudgetRow[]> {
      return selectBudgets(db, userId).orderBy('b.id').limit(200).execute();
    },

    async findById(userId: string, id: string): Promise<BudgetRow | null> {
      const row = await selectBudgets(db, userId).where('b.id', '=', id).executeTakeFirst();
      return row ?? null;
    },

    async count(userId: string): Promise<number> {
      const row = await db
        .selectFrom('budgets')
        .select(sql<number>`count(*)::int`.as('n'))
        .where('userId', '=', userId)
        .executeTakeFirstOrThrow();
      return row.n;
    },

    async insert(budget: NewBudget): Promise<void> {
      await db.insertInto('budgets').values(budget).execute();
    },

    async update(userId: string, id: string, patch: BudgetPatch): Promise<void> {
      const values = {
        ...(patch.amountMinor !== undefined && { amountMinor: patch.amountMinor }),
        ...(patch.warningThresholdPct !== undefined && {
          warningThresholdPct: patch.warningThresholdPct,
        }),
        ...(patch.startDate !== undefined && { startDate: patch.startDate }),
      };
      if (Object.keys(values).length === 0) return;
      await db
        .updateTable('budgets')
        .set(values)
        .where('userId', '=', userId)
        .where('id', '=', id)
        .execute();
    },

    async delete(userId: string, id: string): Promise<boolean> {
      const result = await db
        .deleteFrom('budgets')
        .where('userId', '=', userId)
        .where('id', '=', id)
        .executeTakeFirst();
      return Number(result.numDeletedRows) > 0;
    },

    /**
     * Expense totals per currency and category inside one period (database design 8.2). Served by
     * ix_transactions__user_date (covering). Transfers and income are excluded by `type`;
     * archived wallets and retired categories still count because they are real spending.
     */
    async spentByCategory(userId: string, from: string, to: string): Promise<SpentRow[]> {
      return db
        .selectFrom('transactions')
        .select(['currency', 'categoryId', sql<number>`sum(amount_minor)::bigint`.as('spentMinor')])
        .where('userId', '=', userId)
        .where('type', '=', 'expense')
        .where('occurredOn', '>=', from)
        .where('occurredOn', '<=', to)
        .groupBy(['currency', 'categoryId'])
        .execute();
    },
  };
}

export type BudgetsRepository = ReturnType<typeof createBudgetsRepository>;

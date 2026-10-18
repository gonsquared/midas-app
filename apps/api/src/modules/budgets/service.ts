import {
  BUDGET_LIMIT,
  dateInTimeZone,
  periodStart,
  type Budget,
  type BudgetListResponse,
  type CreateBudgetRequest,
  type UpdateBudgetRequest,
} from '@midas/shared';
import type { Kysely } from 'kysely';
import { v7 as uuidv7 } from 'uuid';
import type { Clock } from '../../platform/clock.js';
import { withTransaction } from '../../platform/db/client.js';
import type { Database } from '../../platform/db/database.js';
import { isForeignKeyViolation, isUniqueViolation } from '../../platform/db/errors.js';
import { LOCK_NAMESPACE, lockUserScope } from '../../platform/db/locks.js';
import { AppError } from '../../platform/errors.js';
import { createCategoriesRepository } from '../categories/repository.js';
import { createBudgetsRepository, type BudgetRow } from './repository.js';
import { isActiveFor, withStatus } from './status.js';

export const BUDGET_UNIQUE_CONSTRAINT = 'uq_budgets__user_category_period_currency';

/** What a budget request needs to know about the caller. */
export interface BudgetPrincipal {
  userId: string;
  preferences: { currency: string; timezone: string };
}

const notFound = () => new AppError('NOT_FOUND', 'The requested resource was not found.');
const invalidCategory = () =>
  new AppError('INVALID_REFERENCE', 'A referenced category was not found.', {
    errors: [
      { field: 'categoryId', code: 'INVALID_REFERENCE', message: 'Not found or not accessible.' },
    ],
  });

function sortKey(row: BudgetRow): string {
  // Overall budgets first, then by category name, period and currency.
  const scope = row.scope === 'overall' ? '0' : '1';
  return [scope, (row.categoryName ?? '').toLowerCase(), row.period, row.currency, row.id].join(
    '\u0000',
  );
}

export class BudgetService {
  constructor(private readonly deps: { db: Kysely<Database>; clock: Clock }) {}

  private today(principal: BudgetPrincipal): string {
    return dateInTimeZone(this.deps.clock.now(), principal.preferences.timezone);
  }

  /** Budgets whose start is not after the end of the requested period, with status (api-contract 10). */
  async list(principal: BudgetPrincipal, date: string | undefined): Promise<BudgetListResponse> {
    const day = date ?? this.today(principal);
    const rows = await createBudgetsRepository(this.deps.db).list(principal.userId);
    const active = rows.filter((row) => isActiveFor(row, day));
    active.sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : 1));
    return { date: day, items: await withStatus(this.deps.db, principal.userId, active, day) };
  }

  async get(principal: BudgetPrincipal, id: string, date: string | undefined): Promise<Budget> {
    const row = await createBudgetsRepository(this.deps.db).findById(principal.userId, id);
    if (!row) throw notFound();
    const day = date ?? this.today(principal);
    const [budget] = await withStatus(this.deps.db, principal.userId, [row], day);
    if (!budget) throw notFound();
    return budget;
  }

  /**
   * Creates a budget. The 200 cap is checked under a per-user advisory lock; the category is
   * locked FOR KEY SHARE like a foreign key check would, so it cannot vanish underneath us.
   */
  async create(principal: BudgetPrincipal, input: CreateBudgetRequest): Promise<Budget> {
    const id = uuidv7();
    const today = this.today(principal);
    try {
      await withTransaction(this.deps.db, async (trx) => {
        await lockUserScope(trx, LOCK_NAMESPACE.budgetLimit, principal.userId);
        const budgets = createBudgetsRepository(trx);
        if ((await budgets.count(principal.userId)) >= BUDGET_LIMIT) {
          throw new AppError('LIMIT_REACHED', `You can have at most ${BUDGET_LIMIT} budgets.`);
        }
        if (input.categoryId !== undefined) {
          const categories = createCategoriesRepository(trx);
          const category = await categories.shareAccessible(principal.userId, input.categoryId);
          if (!category) throw invalidCategory();
          if (category.type !== 'expense') {
            throw new AppError(
              'CATEGORY_TYPE_MISMATCH',
              'Budgets apply to expense categories only.',
            );
          }
          if (category.retiredAt !== null) {
            throw new AppError('CATEGORY_RETIRED', 'Retired categories cannot be selected.');
          }
        }
        await budgets.insert({
          id,
          userId: principal.userId,
          scope: input.scope,
          categoryId: input.categoryId ?? null,
          period: input.period,
          amountMinor: input.amountMinor,
          currency: input.currency ?? principal.preferences.currency,
          warningThresholdPct: input.warningThresholdPct,
          startDate: periodStart(input.period, input.startDate ?? today),
        });
      });
    } catch (error) {
      throw this.mapError(error);
    }
    return this.get(principal, id, today);
  }

  /** Scope, category, period and currency are immutable; the start date is re-aligned to its period. */
  async update(
    principal: BudgetPrincipal,
    id: string,
    input: UpdateBudgetRequest,
  ): Promise<Budget> {
    const budgets = createBudgetsRepository(this.deps.db);
    const current = await budgets.findById(principal.userId, id);
    if (!current) throw notFound();
    await budgets.update(principal.userId, id, {
      ...(input.amountMinor !== undefined && { amountMinor: input.amountMinor }),
      ...(input.warningThresholdPct !== undefined && {
        warningThresholdPct: input.warningThresholdPct,
      }),
      ...(input.startDate !== undefined && {
        startDate: periodStart(current.period, input.startDate),
      }),
    });
    return this.get(principal, id, this.today(principal));
  }

  async remove(userId: string, id: string): Promise<void> {
    if (!(await createBudgetsRepository(this.deps.db).delete(userId, id))) throw notFound();
  }

  private mapError(error: unknown): unknown {
    if (error instanceof AppError) return error;
    if (isUniqueViolation(error, BUDGET_UNIQUE_CONSTRAINT)) {
      return new AppError(
        'BUDGET_EXISTS',
        'A budget for this scope, period and currency already exists.',
      );
    }
    if (isForeignKeyViolation(error, 'fk_category_accessible', 'fk_budgets__category')) {
      return invalidCategory();
    }
    return error;
  }
}

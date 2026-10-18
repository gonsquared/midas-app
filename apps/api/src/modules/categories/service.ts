import {
  CATEGORY_LIMIT,
  type Category,
  type CategoryRef,
  type CreateCategoryRequest,
  type DeleteCategoryResponse,
  type UpdateCategoryRequest,
} from '@midas/shared';
import type { CategoryType } from '@midas/shared';
import type { Kysely } from 'kysely';
import { v7 as uuidv7 } from 'uuid';
import { withTransaction } from '../../platform/db/client.js';
import type { Database } from '../../platform/db/database.js';
import { isForeignKeyViolation, isUniqueViolation } from '../../platform/db/errors.js';
import { LOCK_NAMESPACE, lockUserScope } from '../../platform/db/locks.js';
import { AppError } from '../../platform/errors.js';
import {
  createCategoriesRepository,
  type CategoriesRepository,
  type CategoryRecord,
} from './repository.js';

/** Database design 7.12: both unique indexes map to CATEGORY_NAME_TAKEN. */
const NAME_CONSTRAINTS = [
  'uq_categories__owner_type_name',
  'uq_categories__system_type_name_active',
];
const IN_USE_CONSTRAINTS = [
  'fk_transactions__category',
  'fk_recurring_templates__category',
  'fk_budgets__category',
];

export function toCategoryRef(category: CategoryRecord): CategoryRef {
  return {
    id: category.id,
    name: category.name,
    type: category.type,
    icon: category.icon,
    color: category.color,
    system: category.ownerUserId === null,
    retired: category.retiredAt !== null,
  };
}

export function toCategoryDto(category: CategoryRecord): Category {
  return {
    ...toCategoryRef(category),
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}

const notFound = () => new AppError('NOT_FOUND', 'The requested resource was not found.');
const systemReadOnly = () =>
  new AppError('SYSTEM_CATEGORY_READ_ONLY', 'System categories cannot be changed.');
const inUse = () =>
  new AppError(
    'CATEGORY_IN_USE',
    'This category is in use. Choose another category to move its transactions to.',
  );

function nameTaken(): AppError {
  return new AppError(
    'CATEGORY_NAME_TAKEN',
    'You already have a category with this name and type.',
    {
      errors: [
        {
          field: 'name',
          code: 'CATEGORY_NAME_TAKEN',
          message: 'This category name is already in use.',
        },
      ],
    },
  );
}

export class CategoryService {
  constructor(private readonly deps: { db: Kysely<Database> }) {}

  async list(
    userId: string,
    filter: { type?: CategoryType | undefined; includeRetired: boolean },
  ): Promise<Category[]> {
    const rows = await createCategoriesRepository(this.deps.db).list(userId, filter);
    return rows.map(toCategoryDto);
  }

  async create(userId: string, input: CreateCategoryRequest): Promise<Category> {
    const id = uuidv7();
    try {
      return await withTransaction(this.deps.db, async (trx) => {
        const categories = createCategoriesRepository(trx);
        await lockUserScope(trx, LOCK_NAMESPACE.categoryLimit, userId);
        if ((await categories.countOwned(userId)) >= CATEGORY_LIMIT) {
          throw new AppError('LIMIT_REACHED', `You can have at most ${CATEGORY_LIMIT} categories.`);
        }
        await categories.insert({ id, ownerUserId: userId, ...input });
        const created = await categories.findAccessible(userId, id);
        if (!created) throw new Error('category missing after insert');
        return toCategoryDto(created);
      });
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async update(
    userId: string,
    categoryId: string,
    input: UpdateCategoryRequest,
  ): Promise<Category> {
    try {
      return await withTransaction(this.deps.db, async (trx) => {
        const categories = createCategoriesRepository(trx);
        await this.assertOwnCategory(categories, userId, categoryId);
        if (!(await categories.lockOwned(userId, categoryId, 'noKeyUpdate'))) throw notFound();
        await categories.update(categoryId, userId, input);
        const updated = await categories.findAccessible(userId, categoryId);
        if (!updated) throw notFound();
        return toCategoryDto(updated);
      });
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Deletes a user category (database design C-05). A category in use needs `reassignTo`: an
   * accessible, non-retired category of the same type. Everything happens in one transaction;
   * the restricting foreign keys remain the final guard against a concurrent new reference.
   */
  async remove(
    userId: string,
    categoryId: string,
    reassignTo: string | undefined,
  ): Promise<DeleteCategoryResponse> {
    try {
      return await withTransaction(this.deps.db, async (trx) => {
        const categories = createCategoriesRepository(trx);
        await this.assertOwnCategory(categories, userId, categoryId);
        // FOR UPDATE blocks the key-share lock every new reference needs, so no ledger write can
        // add a reference between the reassignment below and the delete.
        const existing = await categories.lockOwned(userId, categoryId, 'update');
        if (!existing) throw notFound();

        let reassignedTransactions = 0;
        if (await categories.isReferencedByTransactions(userId, categoryId)) {
          if (reassignTo === undefined) throw inUse();
          // Key-share lock, as the reassignment's foreign key check would take: the target cannot
          // be deleted underneath the reassignment.
          const target = await categories.shareAccessible(userId, reassignTo);
          if (
            !target ||
            target.id === categoryId ||
            target.type !== existing.type ||
            target.retiredAt !== null
          ) {
            throw new AppError(
              'REASSIGN_TARGET_INVALID',
              'The replacement category must be an active category of the same type.',
              {
                errors: [
                  {
                    field: 'reassignTo',
                    code: 'REASSIGN_TARGET_INVALID',
                    message: 'Choose a different, active category of the same type.',
                  },
                ],
              },
            );
          }
          reassignedTransactions = await categories.reassignTransactions(
            userId,
            categoryId,
            reassignTo,
          );
        }
        // Recurring templates and budgets are reassigned and deleted here once E8 and E6 add them.
        await categories.delete(categoryId, userId);
        return { reassignedTransactions, reassignedTemplates: 0, deletedBudgets: 0 };
      });
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Plain read for the 404 and 403 answers, so a request against a shared system category never
   * takes a row lock on it.
   */
  private async assertOwnCategory(
    categories: CategoriesRepository,
    userId: string,
    categoryId: string,
  ): Promise<void> {
    const found = await categories.findAccessible(userId, categoryId);
    if (!found) throw notFound();
    if (found.ownerUserId === null) throw systemReadOnly();
  }

  private mapError(error: unknown): unknown {
    if (error instanceof AppError) return error;
    if (NAME_CONSTRAINTS.some((name) => isUniqueViolation(error, name))) return nameTaken();
    if (isForeignKeyViolation(error, ...IN_USE_CONSTRAINTS)) return inUse();
    return error;
  }
}

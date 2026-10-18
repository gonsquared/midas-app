import type {
  Category,
  CategoryType,
  CreateCategoryRequest,
  UpdateCategoryRequest,
} from '@midas/shared';
import type { Kysely, Transaction } from 'kysely';
import { v7 as uuidv7 } from 'uuid';
import type { Clock } from '../../platform/clock.js';
import { withTransaction } from '../../platform/db/client.js';
import type { Database } from '../../platform/db/database.js';
import { isUniqueViolation } from '../../platform/db/errors.js';
import { AppError } from '../../platform/errors.js';
import type { AuditContext, AuditService } from '../audit/service.js';
import { createCategoriesRepository } from '../categories/repository.js';
import { toCategoryDto } from '../categories/service.js';
import type { AdminActor } from './users-service.js';

/** Database design 7.12: the unique index over non-retired system categories. */
const SYSTEM_NAME_CONSTRAINT = 'uq_categories__system_type_name_active';

const notFound = () => new AppError('NOT_FOUND', 'The requested resource was not found.');
const nameTaken = () =>
  new AppError('CATEGORY_NAME_TAKEN', 'A system category with this name and type already exists.', {
    errors: [
      {
        field: 'name',
        code: 'CATEGORY_NAME_TAKEN',
        message: 'This category name is already in use.',
      },
    ],
  });

export interface AdminCategoriesDeps {
  db: Kysely<Database>;
  clock: Clock;
  audit: AuditService;
}

type Trx = Transaction<Database>;

/**
 * System category management (api-contract 14, E9-F3-S1). System categories are never deleted:
 * retiring one keeps it on existing transactions, budgets and templates and only hides it from
 * new selections. User-owned categories are invisible here (404). Every change is audited in the
 * same transaction as the change itself (C-07).
 */
export class AdminCategoryService {
  constructor(private readonly deps: AdminCategoriesDeps) {}

  async list(filter: {
    type?: CategoryType | undefined;
    includeRetired: boolean;
  }): Promise<Category[]> {
    const rows = await createCategoriesRepository(this.deps.db).listSystem(filter);
    return rows.map(toCategoryDto);
  }

  async create(
    actor: AdminActor,
    input: CreateCategoryRequest,
    context: AuditContext,
  ): Promise<Category> {
    const id = uuidv7();
    return this.run(async (trx) => {
      const categories = createCategoriesRepository(trx);
      await categories.insertSystem({ id, ...input });
      await this.deps.audit.recordIn(trx, {
        actorUserId: actor.userId,
        action: 'admin.category_created',
        targetType: 'category',
        targetId: id,
        metadata: { type: input.type },
        context,
      });
      const created = await categories.findSystem(id);
      if (!created) throw new Error('system category missing after insert');
      return toCategoryDto(created);
    });
  }

  async update(
    actor: AdminActor,
    categoryId: string,
    input: UpdateCategoryRequest,
    context: AuditContext,
  ): Promise<Category> {
    return this.run(async (trx) => {
      const categories = createCategoriesRepository(trx);
      const current = await categories.lockSystem(categoryId);
      if (!current) throw notFound();
      const fields = (['name', 'icon', 'color'] as const).filter(
        (field) => input[field] !== undefined && input[field] !== current[field],
      );
      if (fields.length === 0) return toCategoryDto(current);
      await categories.updateSystem(categoryId, input);
      await this.deps.audit.recordIn(trx, {
        actorUserId: actor.userId,
        action: 'admin.category_updated',
        targetType: 'category',
        targetId: categoryId,
        metadata: { fields },
        context,
      });
      const updated = await categories.findSystem(categoryId);
      if (!updated) throw notFound();
      return toCategoryDto(updated);
    });
  }

  async retire(actor: AdminActor, categoryId: string, context: AuditContext): Promise<Category> {
    return this.setRetired(actor, categoryId, true, context);
  }

  async restore(actor: AdminActor, categoryId: string, context: AuditContext): Promise<Category> {
    return this.setRetired(actor, categoryId, false, context);
  }

  /** Idempotent: a category already in the requested state is returned without a new audit row. */
  private async setRetired(
    actor: AdminActor,
    categoryId: string,
    retire: boolean,
    context: AuditContext,
  ): Promise<Category> {
    return this.run(async (trx) => {
      const categories = createCategoriesRepository(trx);
      const current = await categories.lockSystem(categoryId);
      if (!current) throw notFound();
      if ((current.retiredAt !== null) === retire) return toCategoryDto(current);
      await categories.setRetiredAt(categoryId, retire ? this.deps.clock.now() : null);
      await this.deps.audit.recordIn(trx, {
        actorUserId: actor.userId,
        action: retire ? 'admin.category_retired' : 'admin.category_restored',
        targetType: 'category',
        targetId: categoryId,
        context,
      });
      const updated = await categories.findSystem(categoryId);
      if (!updated) throw notFound();
      return toCategoryDto(updated);
    });
  }

  private async run<T>(fn: (trx: Trx) => Promise<T>): Promise<T> {
    try {
      return await withTransaction(this.deps.db, fn);
    } catch (error) {
      if (isUniqueViolation(error, SYSTEM_NAME_CONSTRAINT)) throw nameTaken();
      throw error;
    }
  }
}

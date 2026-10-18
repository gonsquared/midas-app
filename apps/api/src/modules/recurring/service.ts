import {
  RECURRING_LIMIT,
  RECURRING_MAX_BACKDATE_DAYS,
  addDays,
  dateInTimeZone,
  firstOccurrenceOnOrAfter,
  listOccurrences,
  type CreateRecurringTemplateRequest,
  type ListRecurringQuery,
  type ListRunsQuery,
  type PreviewRecurringRequest,
  type PreviewRecurringResponse,
  type RecurrenceRule,
  type RecurringRunPage,
  type RecurringTemplate,
  type UpdateRecurringTemplateRequest,
} from '@midas/shared';
import type { Kysely, Transaction } from 'kysely';
import { v7 as uuidv7 } from 'uuid';
import type { Clock } from '../../platform/clock.js';
import { withTransaction } from '../../platform/db/client.js';
import type { Database } from '../../platform/db/database.js';
import { isForeignKeyViolation } from '../../platform/db/errors.js';
import { LOCK_NAMESPACE, lockUserScope } from '../../platform/db/locks.js';
import { AppError } from '../../platform/errors.js';
import { createCategoriesRepository, type CategoryRecord } from '../categories/repository.js';
import { createWalletsRepository } from '../wallets/repository.js';
import { decodeRunCursor, encodeRunCursor, toRunDto, toTemplateDto } from './dto.js';
import { createRecurringRepository, type TemplateRow } from './repository.js';

export interface RecurringPrincipal {
  userId: string;
  preferences: { timezone: string };
}

const notFound = () => new AppError('NOT_FOUND', 'The requested resource was not found.');
const templateEnded = () => new AppError('TEMPLATE_ENDED', 'This template has ended.');
const walletArchived = () =>
  new AppError('WALLET_ARCHIVED', 'Archived wallets are read-only. Unarchive the wallet first.');
const categoryRetired = () =>
  new AppError('CATEGORY_RETIRED', 'Retired categories cannot be selected.');
const invalidReference = (field: 'walletId' | 'categoryId') =>
  new AppError('INVALID_REFERENCE', 'A referenced wallet or category was not found.', {
    errors: [{ field, code: 'INVALID_REFERENCE', message: 'Not found or not accessible.' }],
  });
const invalidDate = (field: string, code: string, message: string) =>
  new AppError('VALIDATION_FAILED', 'The request is invalid.', {
    errors: [{ field, code, message }],
  });

type Trx = Transaction<Database>;

function ruleOf(row: Pick<TemplateRow, 'frequency' | 'intervalCount' | 'startDate' | 'endDate'>) {
  return {
    frequency: row.frequency,
    interval: row.intervalCount,
    startDate: row.startDate,
    endDate: row.endDate,
  } satisfies RecurrenceRule;
}

export class RecurringService {
  constructor(private readonly deps: { db: Kysely<Database>; clock: Clock }) {}

  private today(principal: RecurringPrincipal): string {
    return dateInTimeZone(this.deps.clock.now(), principal.preferences.timezone);
  }

  async list(userId: string, query: ListRecurringQuery): Promise<RecurringTemplate[]> {
    const rows = await createRecurringRepository(this.deps.db).list(userId, query.status);
    return rows.map(toTemplateDto);
  }

  async get(userId: string, id: string): Promise<RecurringTemplate> {
    return this.load(this.deps.db, userId, id);
  }

  /** Pure calculation, nothing is saved (api-contract 12). */
  preview(principal: RecurringPrincipal, input: PreviewRecurringRequest): PreviewRecurringResponse {
    const rule: RecurrenceRule = {
      frequency: input.frequency,
      interval: input.interval,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
    };
    return {
      dates: listOccurrences(rule, input.fromDate ?? this.today(principal), input.count),
    };
  }

  /**
   * Creates an active template. Lock order follows database design 9.2: the per-user limit lock,
   * then the wallet, then the category (key share), then the insert. The first occurrence is the
   * start date itself, which may lie up to 31 days in the past; the scheduler catches up.
   */
  async create(
    principal: RecurringPrincipal,
    input: CreateRecurringTemplateRequest,
  ): Promise<RecurringTemplate> {
    const id = uuidv7();
    const oldest = addDays(this.today(principal), -RECURRING_MAX_BACKDATE_DAYS);
    if (input.startDate < oldest) {
      throw invalidDate(
        'startDate',
        'TOO_OLD',
        `The start date may be at most ${RECURRING_MAX_BACKDATE_DAYS} days in the past.`,
      );
    }
    try {
      await withTransaction(this.deps.db, async (trx) => {
        await lockUserScope(trx, LOCK_NAMESPACE.recurringLimit, principal.userId);
        const templates = createRecurringRepository(trx);
        if ((await templates.count(principal.userId)) >= RECURRING_LIMIT) {
          throw new AppError('LIMIT_REACHED', `You can have at most ${RECURRING_LIMIT} templates.`);
        }
        const [wallet] = await createWalletsRepository(trx).lockByIds(principal.userId, [
          input.walletId,
        ]);
        if (!wallet) throw invalidReference('walletId');
        const category = await createCategoriesRepository(trx).shareAccessible(
          principal.userId,
          input.categoryId,
        );
        if (!category) throw invalidReference('categoryId');
        if (wallet.archivedAt !== null) throw walletArchived();
        this.assertCategoryUsable(category, input.type, true);

        await templates.insert({
          id,
          userId: principal.userId,
          name: input.name,
          type: input.type,
          walletId: wallet.id,
          categoryId: category.id,
          amountMinor: input.amountMinor,
          note: input.note ?? null,
          frequency: input.frequency,
          intervalCount: input.interval,
          startDate: input.startDate,
          endDate: input.endDate ?? null,
          nextRunOn: input.startDate,
        });
      });
    } catch (error) {
      throw this.mapError(error);
    }
    return this.get(principal.userId, id);
  }

  private assertCategoryUsable(
    category: CategoryRecord,
    type: 'income' | 'expense',
    rejectRetired: boolean,
  ): void {
    if (category.type !== type) {
      throw new AppError(
        'CATEGORY_TYPE_MISMATCH',
        'The category type does not match the template type.',
      );
    }
    if (rejectRetired && category.retiredAt !== null) throw categoryRetired();
  }

  private async load(
    db: Kysely<Database> | Trx,
    userId: string,
    id: string,
  ): Promise<RecurringTemplate> {
    const row = await createRecurringRepository(db).findById(userId, id);
    if (!row) throw notFound();
    return toTemplateDto(row);
  }

  private mapError(error: unknown): unknown {
    if (error instanceof AppError) return error;
    if (isForeignKeyViolation(error, 'fk_recurring_templates__wallet')) {
      return invalidReference('walletId');
    }
    if (
      isForeignKeyViolation(error, 'fk_recurring_templates__category', 'fk_category_accessible')
    ) {
      return invalidReference('categoryId');
    }
    return error;
  }

  /**
   * Edits a template. `type` is not editable. Schedule changes recompute `nextRunOn` as the first
   * occurrence on or after today (no backfill), and a schedule with no occurrence left ends the
   * template. Lock order: wallets by id, category key share, then the template row, the same order
   * the scheduler and wallet archiving use (wallet before template).
   */
  async update(
    principal: RecurringPrincipal,
    id: string,
    input: UpdateRecurringTemplateRequest,
  ): Promise<RecurringTemplate> {
    const today = this.today(principal);
    const oldest = addDays(today, -RECURRING_MAX_BACKDATE_DAYS);
    try {
      await withTransaction(this.deps.db, async (trx) => {
        const templates = createRecurringRepository(trx);
        const seen = await templates.findById(principal.userId, id);
        if (!seen) throw notFound();

        const walletIds = [...new Set([seen.walletId, input.walletId ?? seen.walletId])];
        const locked = await createWalletsRepository(trx).lockByIds(principal.userId, walletIds);
        if (input.walletId !== undefined) {
          const target = locked.find((wallet) => wallet.id === input.walletId);
          if (!target) throw invalidReference('walletId');
          if (target.archivedAt !== null) throw walletArchived();
        }
        const category =
          input.categoryId === undefined
            ? undefined
            : await createCategoriesRepository(trx).shareAccessible(
                principal.userId,
                input.categoryId,
              );
        if (category === null) throw invalidReference('categoryId');

        if (!(await templates.lockById(principal.userId, id))) throw notFound();
        const current = await templates.findById(principal.userId, id);
        if (!current) throw notFound();
        if (current.status === 'ended') throw templateEnded();
        if (category)
          this.assertCategoryUsable(category, current.type, category.id !== current.categoryId);

        const merged = {
          frequency: input.frequency ?? current.frequency,
          intervalCount: input.interval ?? current.intervalCount,
          startDate: input.startDate ?? current.startDate,
          endDate: input.endDate === undefined ? current.endDate : input.endDate,
        };
        if (merged.endDate !== null && merged.endDate < merged.startDate) {
          throw invalidDate(
            'endDate',
            'INVALID_RANGE',
            'The end date must not be before the start date.',
          );
        }
        if (merged.startDate !== current.startDate && merged.startDate < oldest) {
          throw invalidDate('startDate', 'TOO_OLD', 'The start date is too far in the past.');
        }
        const scheduleChanged =
          merged.frequency !== current.frequency ||
          merged.intervalCount !== current.intervalCount ||
          merged.startDate !== current.startDate ||
          merged.endDate !== current.endDate;
        const next = scheduleChanged ? firstOccurrenceOnOrAfter(ruleOf(merged), today) : undefined;

        await templates.update(principal.userId, id, {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.walletId !== undefined && { walletId: input.walletId }),
          ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
          ...(input.amountMinor !== undefined && { amountMinor: input.amountMinor }),
          ...(input.note !== undefined && { note: input.note }),
          ...(scheduleChanged && {
            frequency: merged.frequency,
            intervalCount: merged.intervalCount,
            startDate: merged.startDate,
            endDate: merged.endDate,
            nextRunOn: next ?? null,
            ...(next === null && { status: 'ended' as const }),
          }),
        });
      });
    } catch (error) {
      throw this.mapError(error);
    }
    return this.get(principal.userId, id);
  }

  /** Idempotent. An ended template cannot be paused. */
  async pause(userId: string, id: string): Promise<RecurringTemplate> {
    await withTransaction(this.deps.db, async (trx) => {
      const templates = createRecurringRepository(trx);
      const row = await templates.lockById(userId, id);
      if (!row) throw notFound();
      if (row.status === 'ended') throw templateEnded();
      if (row.status === 'active') await templates.update(userId, id, { status: 'paused' });
    });
    return this.get(userId, id);
  }

  /**
   * Resumes a paused template with no backfill: `nextRunOn` becomes the first occurrence on or
   * after today and the failure counter resets. A schedule with nothing left ends the template.
   */
  async resume(principal: RecurringPrincipal, id: string): Promise<RecurringTemplate> {
    const today = this.today(principal);
    let ended = false;
    try {
      await withTransaction(this.deps.db, async (trx) => {
        const templates = createRecurringRepository(trx);
        const seen = await templates.findById(principal.userId, id);
        if (!seen) throw notFound();
        if (seen.status === 'ended') throw templateEnded();
        if (seen.status === 'active') return; // idempotent

        const [wallet] = await createWalletsRepository(trx).lockByIds(principal.userId, [
          seen.walletId,
        ]);
        if (!wallet) throw notFound();
        if (wallet.archivedAt !== null) throw walletArchived();
        if (!(await templates.lockById(principal.userId, id))) throw notFound();
        const current = await templates.findById(principal.userId, id);
        if (!current) throw notFound();
        if (current.status === 'ended') throw templateEnded();
        if (current.status === 'active') return;
        if (current.categoryRetiredAt !== null) throw categoryRetired();

        const next = firstOccurrenceOnOrAfter(ruleOf(current), today);
        if (next === null) {
          ended = true;
          await templates.update(principal.userId, id, { status: 'ended', nextRunOn: null });
          return;
        }
        await templates.update(principal.userId, id, {
          status: 'active',
          nextRunOn: next,
          consecutiveFailures: 0,
          lastError: null,
        });
      });
    } catch (error) {
      throw this.mapError(error);
    }
    // The state change is committed above; a schedule with nothing left is reported as ended.
    if (ended) throw templateEnded();
    return this.get(principal.userId, id);
  }

  /** Generated transactions are kept; their link is cleared by the foreign key (C-09). */
  async remove(userId: string, id: string): Promise<void> {
    if (!(await createRecurringRepository(this.deps.db).delete(userId, id))) throw notFound();
  }

  async runs(userId: string, templateId: string, query: ListRunsQuery): Promise<RecurringRunPage> {
    const templates = createRecurringRepository(this.deps.db);
    if (!(await templates.findById(userId, templateId))) throw notFound();
    const before = query.cursor ? decodeRunCursor(query.cursor, templateId) : undefined;
    const rows = await templates.listRuns(userId, templateId, query.limit, before);
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page[page.length - 1];
    return {
      items: page.map(toRunDto),
      nextCursor: hasMore && last ? encodeRunCursor(templateId, last.occurrenceDate) : null,
    };
  }
}

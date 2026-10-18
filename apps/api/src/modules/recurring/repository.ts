import type {
  CategoryType,
  RecurringFrequency,
  RecurringRunStatus,
  RecurringStatus,
  RecurringType,
} from '@midas/shared';
import { sql } from 'kysely';
import type { DbHandle } from '../../platform/db/client.js';

export interface TemplateRow {
  id: string;
  name: string;
  type: RecurringType;
  walletId: string;
  walletName: string;
  walletCurrency: string;
  walletArchivedAt: Date | null;
  categoryId: string;
  categoryName: string;
  categoryType: CategoryType;
  categoryIcon: string;
  categoryColor: string;
  categoryOwnerId: string | null;
  categoryRetiredAt: Date | null;
  amountMinor: number;
  note: string | null;
  frequency: RecurringFrequency;
  intervalCount: number;
  startDate: string;
  endDate: string | null;
  nextRunOn: string | null;
  status: RecurringStatus;
  consecutiveFailures: number;
  lastRunAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RunRow {
  id: string;
  templateId: string;
  occurrenceDate: string;
  status: RecurringRunStatus;
  transactionId: string | null;
  errorCode: string | null;
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewTemplate {
  id: string;
  userId: string;
  name: string;
  type: RecurringType;
  walletId: string;
  categoryId: string;
  amountMinor: number;
  note: string | null;
  frequency: RecurringFrequency;
  intervalCount: number;
  startDate: string;
  endDate: string | null;
  nextRunOn: string;
}

/** The columns a request may change; the status fields are set by the service rules. */
export interface TemplatePatch {
  name?: string;
  walletId?: string;
  categoryId?: string;
  amountMinor?: number;
  note?: string | null;
  frequency?: RecurringFrequency;
  intervalCount?: number;
  startDate?: string;
  endDate?: string | null;
  nextRunOn?: string | null;
  status?: RecurringStatus;
  consecutiveFailures?: number;
  lastError?: string | null;
}

export function selectTemplates(db: DbHandle, userId: string) {
  return db
    .selectFrom('recurringTemplates as r')
    .innerJoin('wallets as w', 'w.id', 'r.walletId')
    .innerJoin('categories as c', 'c.id', 'r.categoryId')
    .select([
      'r.id',
      'r.name',
      'r.type',
      'r.walletId',
      'w.name as walletName',
      'w.currency as walletCurrency',
      'w.archivedAt as walletArchivedAt',
      'r.categoryId',
      'c.name as categoryName',
      'c.type as categoryType',
      'c.icon as categoryIcon',
      'c.color as categoryColor',
      'c.ownerUserId as categoryOwnerId',
      'c.retiredAt as categoryRetiredAt',
      'r.amountMinor',
      'r.note',
      'r.frequency',
      'r.intervalCount',
      'r.startDate',
      'r.endDate',
      'r.nextRunOn',
      'r.status',
      'r.consecutiveFailures',
      'r.lastRunAt',
      'r.lastError',
      'r.createdAt',
      'r.updatedAt',
    ])
    .where('r.userId', '=', userId);
}

/** Every method is scoped by `user_id`, so another user's template is simply not found. */
export function createRecurringRepository(db: DbHandle) {
  return {
    async list(userId: string, status: RecurringStatus | undefined): Promise<TemplateRow[]> {
      let query = selectTemplates(db, userId);
      if (status !== undefined) query = query.where('r.status', '=', status);
      return query
        .orderBy(sql`r.next_run_on asc nulls last`)
        .orderBy('r.id')
        .limit(200)
        .execute();
    },

    async findById(userId: string, id: string): Promise<TemplateRow | null> {
      const row = await selectTemplates(db, userId).where('r.id', '=', id).executeTakeFirst();
      return row ?? null;
    },

    /** Locks the template row for a change; the caller already holds any wallet locks. */
    async lockById(
      userId: string,
      id: string,
    ): Promise<{ id: string; status: RecurringStatus } | null> {
      const row = await db
        .selectFrom('recurringTemplates')
        .select(['id', 'status'])
        .where('userId', '=', userId)
        .where('id', '=', id)
        .forNoKeyUpdate()
        .executeTakeFirst();
      return row ?? null;
    },

    async count(userId: string): Promise<number> {
      const row = await db
        .selectFrom('recurringTemplates')
        .select(sql<number>`count(*)::int`.as('n'))
        .where('userId', '=', userId)
        .executeTakeFirstOrThrow();
      return row.n;
    },

    async insert(template: NewTemplate): Promise<void> {
      await db.insertInto('recurringTemplates').values(template).execute();
    },

    async update(userId: string, id: string, patch: TemplatePatch): Promise<void> {
      const values = {
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.walletId !== undefined && { walletId: patch.walletId }),
        ...(patch.categoryId !== undefined && { categoryId: patch.categoryId }),
        ...(patch.amountMinor !== undefined && { amountMinor: patch.amountMinor }),
        ...(patch.note !== undefined && { note: patch.note }),
        ...(patch.frequency !== undefined && { frequency: patch.frequency }),
        ...(patch.intervalCount !== undefined && { intervalCount: patch.intervalCount }),
        ...(patch.startDate !== undefined && { startDate: patch.startDate }),
        ...(patch.endDate !== undefined && { endDate: patch.endDate }),
        ...(patch.nextRunOn !== undefined && { nextRunOn: patch.nextRunOn }),
        ...(patch.status !== undefined && { status: patch.status }),
        ...(patch.consecutiveFailures !== undefined && {
          consecutiveFailures: patch.consecutiveFailures,
        }),
        ...(patch.lastError !== undefined && { lastError: patch.lastError }),
      };
      if (Object.keys(values).length === 0) return;
      await db
        .updateTable('recurringTemplates')
        .set(values)
        .where('userId', '=', userId)
        .where('id', '=', id)
        .execute();
    },

    async delete(userId: string, id: string): Promise<boolean> {
      const result = await db
        .deleteFrom('recurringTemplates')
        .where('userId', '=', userId)
        .where('id', '=', id)
        .executeTakeFirst();
      return Number(result.numDeletedRows) > 0;
    },

    /** Newest occurrence first; fetches `limit + 1` rows. Ownership is checked via the template. */
    async listRuns(
      userId: string,
      templateId: string,
      limit: number,
      before: string | undefined,
    ): Promise<RunRow[]> {
      let query = db
        .selectFrom('recurringRuns as run')
        .innerJoin('recurringTemplates as r', 'r.id', 'run.templateId')
        .select([
          'run.id',
          'run.templateId',
          'run.occurrenceDate',
          'run.status',
          'run.transactionId',
          'run.errorCode',
          'run.attempts',
          'run.createdAt',
          'run.updatedAt',
        ])
        .where('r.userId', '=', userId)
        .where('run.templateId', '=', templateId);
      if (before !== undefined) query = query.where('run.occurrenceDate', '<', before);
      return query
        .orderBy('run.occurrenceDate', 'desc')
        .limit(limit + 1)
        .execute();
    },
  };
}

export type RecurringRepository = ReturnType<typeof createRecurringRepository>;

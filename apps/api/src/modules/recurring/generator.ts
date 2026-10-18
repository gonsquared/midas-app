import {
  addDays,
  dateInTimeZone,
  nextOccurrenceAfter,
  type RecurrenceRule,
  type RecurringFrequency,
  type RecurringType,
} from '@midas/shared';
import { sql, type ControlledTransaction, type Kysely } from 'kysely';
import { v7 as uuidv7 } from 'uuid';
import type { Clock } from '../../platform/clock.js';
import type { Database } from '../../platform/db/database.js';
import { constraintOf, isPgError } from '../../platform/db/errors.js';
import type { Counter } from '../../platform/metrics.js';
import { createWalletsRepository } from '../wallets/repository.js';

/**
 * Recurring generation (ADR-011, database design C-03). One database transaction per occurrence:
 * wallet lock, template lock with SKIP LOCKED, due check in the owner's time zone, then the
 * transaction row and the run row (the unique key on template and occurrence date is the final
 * guard against duplicates), then the template bookkeeping. Concurrent runners, in this process
 * or another, therefore never double-generate: a locked template is simply skipped.
 */
export interface GeneratorLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

export interface GeneratorDeps {
  db: Kysely<Database>;
  clock: Clock;
  /** Most occurrences generated per template per tick; the rest continue on later ticks. */
  maxCatchup: number;
  /** Consecutive failures after which a template is paused. */
  maxFailures: number;
  logger: GeneratorLogger;
  counter?: Counter | undefined;
  /** Templates read per candidate page. */
  batchSize?: number;
}

export interface TickResult {
  templates: number;
  generated: number;
  advanced: number;
  skipped: number;
  failed: number;
  errors: number;
}

type Outcome = 'generated' | 'advanced' | 'skipped' | 'failed' | 'idle';

interface Candidate {
  id: string;
  userId: string;
  walletId: string;
  nextRunOn: string;
}

interface LockedTemplate {
  id: string;
  userId: string;
  walletId: string;
  categoryId: string;
  type: RecurringType;
  amountMinor: number;
  note: string | null;
  frequency: RecurringFrequency;
  intervalCount: number;
  startDate: string;
  endDate: string | null;
  nextRunOn: string;
  consecutiveFailures: number;
}

type Trx = ControlledTransaction<Database>;

class DuplicateRun extends Error {}

/** Error codes recorded on a failed run: stable, uppercase, never database text. */
function failureCode(error: unknown): string {
  const constraint = constraintOf(error);
  if (constraint === 'ck_wallets__balance_range') return 'BALANCE_OUT_OF_RANGE';
  if (
    constraint === 'fk_category_accessible' ||
    constraint === 'fk_transactions__category' ||
    constraint === 'fk_transactions__wallet'
  ) {
    return 'REFERENCE_INVALID';
  }
  return isPgError(error) ? 'DATABASE_ERROR' : 'GENERATION_FAILED';
}

const ruleOf = (t: LockedTemplate): RecurrenceRule => ({
  frequency: t.frequency,
  interval: t.intervalCount,
  startDate: t.startDate,
  endDate: t.endDate,
});

export class RecurringGenerator {
  constructor(private readonly deps: GeneratorDeps) {}

  /** One scheduler pass over every due template. Safe to run concurrently with other passes. */
  async tick(signal?: { aborted: boolean }): Promise<TickResult> {
    const result: TickResult = {
      templates: 0,
      generated: 0,
      advanced: 0,
      skipped: 0,
      failed: 0,
      errors: 0,
    };
    const { db, clock, maxCatchup } = this.deps;
    const batchSize = this.deps.batchSize ?? 100;
    // The latest "today" anywhere on earth is UTC+14, so one day past UTC today bounds every user.
    const bound = addDays(clock.now().toISOString().slice(0, 10), 1);
    const seen = new Set<string>();
    let after: { nextRunOn: string; id: string } | undefined;

    for (;;) {
      if (signal?.aborted) break;
      let page = db
        .selectFrom('recurringTemplates')
        .select(['id', 'userId', 'walletId', 'nextRunOn'])
        .where('status', '=', 'active')
        .where('nextRunOn', '<=', bound)
        // Suspended owners are not scanned at all; occurrence() re-checks under lock.
        .where(
          sql<boolean>`exists (select 1 from users u where u.id = recurring_templates.user_id and u.status = 'active')`,
        );
      if (after) {
        page = page.where(
          sql<boolean>`(next_run_on, id) > (${after.nextRunOn}::date, ${after.id}::uuid)`,
        );
      }
      const rows = await page.orderBy('nextRunOn').orderBy('id').limit(batchSize).execute();
      if (rows.length === 0) break;
      const last = rows[rows.length - 1];
      if (last?.nextRunOn) after = { nextRunOn: last.nextRunOn, id: last.id };

      for (const row of rows) {
        if (signal?.aborted) break;
        if (seen.has(row.id) || row.nextRunOn === null) continue;
        seen.add(row.id);
        result.templates += 1;
        const candidate: Candidate = {
          id: row.id,
          userId: row.userId,
          walletId: row.walletId,
          nextRunOn: row.nextRunOn,
        };
        await this.catchUp(candidate, maxCatchup, result, signal);
      }
      if (rows.length < batchSize) break;
    }
    return result;
  }

  /** Generates the due occurrences of one template, oldest first, up to the per-tick cap. */
  private async catchUp(
    candidate: Candidate,
    cap: number,
    result: TickResult,
    signal?: { aborted: boolean },
  ): Promise<void> {
    for (let i = 0; i < cap; i++) {
      if (signal?.aborted) return;
      let outcome: Outcome;
      try {
        outcome = await this.processOccurrence(candidate);
      } catch (error) {
        result.errors += 1;
        this.deps.counter?.inc({ result: 'error' });
        this.deps.logger.error({ err: error, templateId: candidate.id }, 'recurring tick error');
        return;
      }
      if (outcome === 'idle') return;
      result[outcome] += 1;
      this.deps.counter?.inc({ result: outcome });
      // A failure or a skip stops this template for the tick; it is retried on the next one.
      if (outcome === 'failed' || outcome === 'skipped') return;
    }
  }

  private async processOccurrence(candidate: Candidate): Promise<Outcome> {
    const trx = await this.deps.db.startTransaction().execute();
    try {
      const outcome = await this.occurrence(trx, candidate);
      if (outcome === 'duplicate') {
        // Another runner won the unique key: undo everything this attempt wrote.
        await trx.rollback().execute();
        return 'idle';
      }
      await trx.commit().execute();
      return outcome;
    } catch (error) {
      await trx
        .rollback()
        .execute()
        .catch(() => undefined);
      throw error;
    }
  }

  private async occurrence(trx: Trx, candidate: Candidate): Promise<Outcome | 'duplicate'> {
    const { clock, maxFailures } = this.deps;
    const now = clock.now();
    const bound = addDays(now.toISOString().slice(0, 10), 1);

    // Lock order: wallet, then template (the same order as wallet archiving and template edits).
    const [wallet] = await createWalletsRepository(trx).lockByIds(candidate.userId, [
      candidate.walletId,
    ]);
    if (!wallet) return 'idle';
    const row = await trx
      .selectFrom('recurringTemplates')
      .select([
        'id',
        'userId',
        'walletId',
        'categoryId',
        'type',
        'amountMinor',
        'note',
        'frequency',
        'intervalCount',
        'startDate',
        'endDate',
        'nextRunOn',
        'consecutiveFailures',
      ])
      .where('id', '=', candidate.id)
      .where('status', '=', 'active')
      .where('nextRunOn', '<=', bound)
      .forUpdate()
      .skipLocked()
      .executeTakeFirst();
    // No row: another runner holds it, or it was paused, edited or deleted since the candidate scan.
    if (!row || row.nextRunOn === null || row.walletId !== wallet.id) return 'idle';
    const template: LockedTemplate = { ...row, nextRunOn: row.nextRunOn };

    const owner = await trx
      .selectFrom('users')
      .select(['timezone', 'status'])
      .where('id', '=', template.userId)
      .executeTakeFirst();
    // A suspended owner gets nothing generated; the template stays due and resumes if reactivated.
    if (!owner || owner.status !== 'active') return 'idle';
    if (template.nextRunOn > dateInTimeZone(now, owner?.timezone ?? 'UTC')) return 'idle';
    const occurrenceDate = template.nextRunOn;

    const existing = await trx
      .selectFrom('recurringRuns')
      .select('status')
      .where('templateId', '=', template.id)
      .where('occurrenceDate', '=', occurrenceDate)
      .executeTakeFirst();
    if (existing && existing.status !== 'failed') {
      await this.advance(trx, template, occurrenceDate, now, false);
      return 'advanced';
    }

    const category = await trx
      .selectFrom('categories')
      .select('retiredAt')
      .where('id', '=', template.categoryId)
      .forKeyShare()
      .executeTakeFirst();
    const skipCode =
      wallet.archivedAt !== null
        ? 'WALLET_ARCHIVED'
        : category && category.retiredAt !== null
          ? 'CATEGORY_RETIRED'
          : null;
    if (skipCode) {
      await this.upsertRun(trx, template.id, occurrenceDate, 'skipped', null, skipCode);
      await trx
        .updateTable('recurringTemplates')
        .set({ status: 'paused', lastError: skipCode })
        .where('id', '=', template.id)
        .execute();
      this.deps.logger.warn(
        { templateId: template.id, code: skipCode },
        'recurring occurrence skipped, template paused',
      );
      return 'skipped';
    }

    const savepoint = await trx.savepoint('generate').execute();
    try {
      const transactionId = uuidv7();
      await savepoint
        .insertInto('transactions')
        .values({
          id: transactionId,
          userId: template.userId,
          walletId: wallet.id,
          type: template.type,
          categoryId: template.categoryId,
          amountMinor: template.amountMinor,
          currency: wallet.currency,
          occurredOn: occurrenceDate,
          note: template.note,
          recurringTemplateId: template.id,
        })
        .execute();
      const run = await this.upsertRun(
        savepoint,
        template.id,
        occurrenceDate,
        'succeeded',
        transactionId,
        null,
      );
      if (!run) throw new DuplicateRun();
    } catch (error) {
      if (error instanceof DuplicateRun) return 'duplicate';
      await savepoint.rollbackToSavepoint('generate').execute();
      await this.recordFailure(trx, template, occurrenceDate, error, maxFailures);
      return 'failed';
    }
    await this.advance(trx, template, occurrenceDate, now, true);
    return 'generated';
  }

  /** Moves `next_run_on` to the following occurrence, or ends the template after its last one. */
  private async advance(
    trx: Trx,
    template: LockedTemplate,
    occurrenceDate: string,
    now: Date,
    generated: boolean,
  ): Promise<void> {
    const next = nextOccurrenceAfter(ruleOf(template), occurrenceDate);
    await trx
      .updateTable('recurringTemplates')
      .set({
        nextRunOn: next,
        status: next === null ? 'ended' : 'active',
        ...(generated && { lastRunAt: now, consecutiveFailures: 0, lastError: null }),
      })
      .where('id', '=', template.id)
      .execute();
  }

  /**
   * A failed occurrence is recorded and retried on the next tick. After `maxFailures` in a row the
   * template is paused and an error is logged. Only the SQLSTATE-derived code is stored.
   */
  private async recordFailure(
    trx: Trx,
    template: LockedTemplate,
    occurrenceDate: string,
    error: unknown,
    maxFailures: number,
  ): Promise<void> {
    const code = failureCode(error);
    await this.upsertRun(trx, template.id, occurrenceDate, 'failed', null, code);
    const failures = template.consecutiveFailures + 1;
    const pause = failures >= maxFailures;
    await trx
      .updateTable('recurringTemplates')
      .set({
        consecutiveFailures: failures,
        lastError: code,
        ...(pause && { status: 'paused' as const }),
      })
      .where('id', '=', template.id)
      .execute();
    const fields = { templateId: template.id, code, failures, constraint: constraintOf(error) };
    if (pause) this.deps.logger.error(fields, 'recurring template paused after repeated failures');
    else this.deps.logger.warn(fields, 'recurring occurrence failed, will retry');
  }

  /**
   * AP-11: one run row per template and occurrence date. Only a previously failed run can be
   * overwritten (a retry); no row returned means the occurrence already succeeded or was skipped.
   */
  private async upsertRun(
    db: Trx,
    templateId: string,
    occurrenceDate: string,
    status: 'succeeded' | 'skipped' | 'failed',
    transactionId: string | null,
    errorCode: string | null,
  ): Promise<boolean> {
    const row = await db
      .insertInto('recurringRuns')
      .values({ id: uuidv7(), templateId, occurrenceDate, status, transactionId, errorCode })
      .onConflict((oc) =>
        oc
          .columns(['templateId', 'occurrenceDate'])
          .doUpdateSet((eb) => ({
            status: eb.ref('excluded.status'),
            transactionId: eb.ref('excluded.transactionId'),
            errorCode: eb.ref('excluded.errorCode'),
            attempts: eb('recurringRuns.attempts', '+', 1),
          }))
          .where('recurringRuns.status', '=', 'failed'),
      )
      .returning('id')
      .executeTakeFirst();
    return row !== undefined;
  }
}

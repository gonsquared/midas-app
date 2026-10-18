import { createHash } from 'node:crypto';
import {
  LocalDateSchema,
  type CurrencyCode,
  type RecurringRun,
  type RecurringTemplate,
} from '@midas/shared';
import { z } from 'zod';
import { AppError } from '../../platform/errors.js';
import { walletRef } from '../transactions/dto.js';
import type { RunRow, TemplateRow } from './repository.js';

export function toTemplateDto(row: TemplateRow): RecurringTemplate {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    wallet: walletRef({
      id: row.walletId,
      name: row.walletName,
      currency: row.walletCurrency,
      archivedAt: row.walletArchivedAt,
    }),
    category: {
      id: row.categoryId,
      name: row.categoryName,
      type: row.categoryType,
      icon: row.categoryIcon,
      color: row.categoryColor,
      system: row.categoryOwnerId === null,
      retired: row.categoryRetiredAt !== null,
    },
    amountMinor: row.amountMinor,
    currency: row.walletCurrency as CurrencyCode,
    note: row.note,
    frequency: row.frequency,
    interval: row.intervalCount,
    startDate: row.startDate,
    endDate: row.endDate,
    nextRunOn: row.nextRunOn,
    status: row.status,
    lastRunAt: row.lastRunAt ? row.lastRunAt.toISOString() : null,
    lastError: row.lastError,
    consecutiveFailures: row.consecutiveFailures,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toRunDto(row: RunRow): RecurringRun {
  return {
    id: row.id,
    templateId: row.templateId,
    occurrenceDate: row.occurrenceDate,
    status: row.status,
    transactionId: row.transactionId,
    errorCode: row.errorCode,
    attempts: row.attempts,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Cursor of the run list: the occurrence date of the last row, bound to the template. Opaque
 * base64url JSON; a cursor from another template is rejected as INVALID_CURSOR.
 */
const RunCursorSchema = z.strictObject({
  v: z.literal(1),
  t: z.string().length(22),
  d: LocalDateSchema,
});

const templateTag = (templateId: string) =>
  createHash('sha256').update(templateId).digest('base64url').slice(0, 22);

export function encodeRunCursor(templateId: string, occurrenceDate: string): string {
  const payload = { v: 1, t: templateTag(templateId), d: occurrenceDate };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeRunCursor(cursor: string, templateId: string): string {
  const invalid = () =>
    new AppError('INVALID_CURSOR', 'The pagination cursor is invalid for this query.');
  let raw: unknown;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error('shape');
    raw = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw invalid();
  }
  const parsed = RunCursorSchema.safeParse(raw);
  if (!parsed.success || parsed.data.t !== templateTag(templateId)) throw invalid();
  return parsed.data.d;
}

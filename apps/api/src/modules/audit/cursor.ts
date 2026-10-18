import { createHash } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../../platform/errors.js';

/**
 * Keyset cursor for the audit log (database design 7.11): base64url JSON holding the sort key of
 * the last row and a hash of the filters, so a cursor from another query is rejected. It is not
 * signed; it can only move an admin within the audit log they may read in full anyway, and every
 * value is validated and bound as a query parameter.
 */
const PayloadSchema = z.strictObject({
  v: z.literal(1),
  f: z.string().length(22),
  k: z.tuple([z.iso.datetime(), z.uuid()]),
});

export interface AuditCursorFilters {
  actorId?: string | undefined;
  actorEmail?: string | undefined;
  action?: string[] | undefined;
  targetType?: string | undefined;
  targetId?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

export function auditFilterHash(filters: AuditCursorFilters): string {
  const canonical = JSON.stringify([
    filters.actorId ?? null,
    filters.actorEmail ?? null,
    [...(filters.action ?? [])].sort(),
    filters.targetType ?? null,
    filters.targetId ?? null,
    filters.from ?? null,
    filters.to ?? null,
  ]);
  return createHash('sha256').update(canonical).digest('base64url').slice(0, 22);
}

function invalidCursor(): AppError {
  return new AppError('INVALID_CURSOR', 'The pagination cursor is invalid for this query.');
}

export function encodeAuditCursor(
  filters: AuditCursorFilters,
  key: { occurredAt: string; id: string },
): string {
  const payload = { v: 1, f: auditFilterHash(filters), k: [key.occurredAt, key.id] };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeAuditCursor(
  cursor: string,
  filters: AuditCursorFilters,
): { occurredAt: string; id: string } {
  let raw: unknown;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error('shape');
    raw = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw invalidCursor();
  }
  const parsed = PayloadSchema.safeParse(raw);
  if (!parsed.success || parsed.data.f !== auditFilterHash(filters)) throw invalidCursor();
  return { occurredAt: parsed.data.k[0], id: parsed.data.k[1] };
}

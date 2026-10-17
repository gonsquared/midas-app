/** Structural view of a node-postgres DatabaseError (no import needed to narrow). */
export interface PgErrorLike {
  code: string;
  constraint?: string | undefined;
}

export function isPgError(error: unknown): error is PgErrorLike {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string' &&
    /^[0-9A-Z]{5}$/.test((error as { code: string }).code)
  );
}

export function isUniqueViolation(error: unknown, constraint: string): boolean {
  return isPgError(error) && error.code === '23505' && error.constraint === constraint;
}

/** SQLSTATE 23503 (foreign_key_violation); PostgreSQL 18 reports ON DELETE RESTRICT as 23001. */
const FOREIGN_KEY_CODES = new Set(['23503', '23001']);

export function isForeignKeyViolation(error: unknown, ...constraints: string[]): boolean {
  return (
    isPgError(error) &&
    FOREIGN_KEY_CODES.has(error.code) &&
    error.constraint !== undefined &&
    (constraints.length === 0 || constraints.includes(error.constraint))
  );
}

export function isCheckViolation(error: unknown, constraint: string): boolean {
  return isPgError(error) && error.code === '23514' && error.constraint === constraint;
}

/** Constraint name for structured logs (never the message, which can carry row data). */
export function constraintOf(error: unknown): string | undefined {
  return isPgError(error) ? error.constraint : undefined;
}

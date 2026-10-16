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

import { RegisterRequestSchema } from '@midas/shared';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError, buildProblem, problemType, zodToFieldErrors } from './errors.js';

function fieldErrors(schema: z.ZodType, input: unknown) {
  const result = schema.safeParse(input);
  if (result.success) throw new Error('expected failure');
  return zodToFieldErrors(result.error);
}

describe('zodToFieldErrors', () => {
  it('maps missing, short, long, unknown and type issues to stable codes', () => {
    const schema = z.strictObject({
      a: z.string(),
      b: z.string().min(3),
      c: z.string().max(2),
      d: z.object({ e: z.number() }),
    });
    const errors = fieldErrors(schema, { b: 'x', c: 'xxx', d: { e: 'no' }, extra: 1 });
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'a', code: 'REQUIRED' }),
        expect.objectContaining({ field: 'b', code: 'TOO_SHORT' }),
        expect.objectContaining({ field: 'c', code: 'TOO_LONG' }),
        expect.objectContaining({ field: 'd.e', code: 'INVALID_TYPE' }),
        expect.objectContaining({ field: 'extra', code: 'UNKNOWN_FIELD' }),
      ]),
    );
  });

  it('uses the custom issue code for the weak-password check', () => {
    const errors = fieldErrors(RegisterRequestSchema, {
      email: 'a@example.com',
      password: 'password1234',
      displayName: 'A',
    });
    expect(errors).toEqual([expect.objectContaining({ field: 'password', code: 'WEAK_PASSWORD' })]);
  });

  it('reports a non-object body under the field "body"', () => {
    expect(fieldErrors(z.object({}), 'nope')[0]).toMatchObject({ field: 'body' });
  });
});

describe('problem details', () => {
  it('builds an RFC 9457 body from the catalogue', () => {
    const problem = buildProblem({
      code: 'EMAIL_TAKEN',
      detail: 'taken',
      instance: '/api/v1/auth/register',
      requestId: 'req-12345678',
    });
    expect(problem).toEqual({
      type: 'https://midas.app/problems/email-taken',
      title: 'Email already registered',
      status: 409,
      detail: 'taken',
      instance: '/api/v1/auth/register',
      code: 'EMAIL_TAKEN',
      requestId: 'req-12345678',
    });
    expect(problemType('VALIDATION_FAILED')).toBe('https://midas.app/problems/validation-failed');
  });

  it('derives the status from the code', () => {
    expect(new AppError('RATE_LIMITED', 'x').status).toBe(429);
    expect(new AppError('INTERNAL_ERROR', 'x').status).toBe(500);
  });
});

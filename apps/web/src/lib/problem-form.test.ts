import { describe, expect, it } from 'vitest';
import { ApiError, NETWORK_ERROR_CODE } from './api-client';
import { applyProblemToForm } from './problem-form';

const problem = (init: Partial<ConstructorParameters<typeof ApiError>[0]> = {}) =>
  new ApiError({ status: 400, code: 'VALIDATION_FAILED', title: 'Invalid', ...init });

describe('applyProblemToForm', () => {
  it('lands mapped field errors on their fields', () => {
    const result = applyProblemToForm(
      problem({
        fieldErrors: [
          { field: 'amountMinor', code: 'TOO_SMALL', message: 'Too small' },
          { field: 'occurredOn', code: 'INVALID', message: 'Bad date' },
        ],
      }),
      { fieldMap: { amountMinor: 'amount', occurredOn: 'date' } },
    );
    expect(result.fields).toEqual({ amount: 'Too small', date: 'Bad date' });
    expect(result.form).toBeNull();
  });

  it('sends unmapped field errors to the form-level message', () => {
    const result = applyProblemToForm(
      problem({ fieldErrors: [{ field: 'surprise', code: 'X', message: 'Odd' }] }),
      { fieldMap: { amountMinor: 'amount' } },
    );
    expect(result.fields).toEqual({});
    expect(result.form).toBe('Odd');
  });

  it('applies code rules to a field or to the form', () => {
    const rules = {
      WALLET_NAME_TAKEN: { field: 'name', message: 'You already have a wallet with this name.' },
      LIMIT_REACHED: { message: 'Limit reached.' },
    };
    expect(
      applyProblemToForm(problem({ status: 409, code: 'WALLET_NAME_TAKEN' }), { codeRules: rules })
        .fields,
    ).toEqual({ name: 'You already have a wallet with this name.' });
    expect(
      applyProblemToForm(problem({ status: 409, code: 'LIMIT_REACHED' }), { codeRules: rules })
        .form,
    ).toBe('Limit reached.');
  });

  it('explains rate limits with the retry delay', () => {
    const result = applyProblemToForm(
      problem({ status: 429, code: 'RATE_LIMITED', retryAfterSeconds: 42 }),
    );
    expect(result.form).toContain('42 seconds');
    expect(result.retryAfterSeconds).toBe(42);
  });

  it('flags a network failure as an unknown outcome and hides 5xx internals', () => {
    const network = applyProblemToForm(problem({ status: 0, code: NETWORK_ERROR_CODE }));
    expect(network.networkUnknown).toBe(true);
    const server = applyProblemToForm(
      problem({ status: 500, code: 'INTERNAL_ERROR', detail: 'stack trace at db.ts:12' }),
    );
    expect(server.form).toBe('Something went wrong on our side. Try again in a moment.');
    expect(server.form).not.toContain('stack');
  });

  it('treats non-API errors generically', () => {
    expect(applyProblemToForm(new Error('boom')).form).toBe('Something went wrong. Try again.');
  });
});

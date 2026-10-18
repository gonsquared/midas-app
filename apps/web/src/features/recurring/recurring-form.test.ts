import { describe, expect, it } from 'vitest';
import { makeTemplate } from '@/test/fixtures';
import {
  emptyRecurringForm,
  parseInterval,
  toCreateRequest,
  toUpdateRequest,
  validateRecurringForm,
} from './recurring-form';

const TODAY = '2026-10-16';
const ctx = { locale: 'en-US', currency: 'USD', today: TODAY, mode: 'create' as const };
const valid = {
  ...emptyRecurringForm(TODAY),
  name: 'Rent',
  amount: '1200',
  walletId: 'w',
  categoryId: 'c',
};

describe('parseInterval', () => {
  it('accepts 1 to 99 only', () => {
    expect(parseInterval('1')).toBe(1);
    expect(parseInterval(' 99 ')).toBe(99);
    for (const bad of ['', '0', '100', '1.5', '-1', 'x']) expect(parseInterval(bad)).toBeNull();
  });
});

describe('validateRecurringForm', () => {
  it('passes a complete form and returns minor units', () => {
    const result = validateRecurringForm(valid, ctx);
    expect(result.errors).toEqual({});
    expect(result.amountMinor).toBe(120000);
    expect(result.interval).toBe(1);
  });

  it('reports every missing required field with plain words', () => {
    const { errors } = validateRecurringForm(emptyRecurringForm(TODAY), ctx);
    expect(errors).toEqual({
      name: 'Enter a name.',
      amount: 'Enter an amount greater than 0.',
      walletId: 'Choose a wallet.',
      categoryId: 'Choose a category.',
    });
  });

  it('limits the start date to 31 days back when creating, but not when editing', () => {
    const old = { ...valid, startDate: '2026-09-10' };
    expect(validateRecurringForm(old, ctx).errors.startDate).toBe(
      'The start date can be at most 31 days in the past.',
    );
    expect(validateRecurringForm({ ...valid, startDate: '2026-09-15' }, ctx).errors).toEqual({});
    expect(validateRecurringForm(old, { ...ctx, mode: 'edit' }).errors).toEqual({});
  });

  it('requires an end date on or after the start when "On date" is chosen', () => {
    const early = { ...valid, endMode: 'on' as const, endDate: '2026-10-01' };
    expect(validateRecurringForm(early, ctx).errors.endDate).toBe(
      'The end date must not be before the start date.',
    );
    expect(validateRecurringForm({ ...early, endDate: '' }, ctx).errors.endDate).toBe(
      'Enter a valid end date.',
    );
  });
});

describe('requests', () => {
  it('builds a create request without empty optional fields', () => {
    expect(toCreateRequest(valid, 120000, 1)).toEqual({
      name: 'Rent',
      type: 'expense',
      walletId: 'w',
      categoryId: 'c',
      amountMinor: 120000,
      frequency: 'monthly',
      interval: 1,
      startDate: TODAY,
    });
    const withEnd = { ...valid, note: ' flat ', endMode: 'on' as const, endDate: '2027-01-01' };
    expect(toCreateRequest(withEnd, 5, 2)).toMatchObject({
      note: 'flat',
      endDate: '2027-01-01',
      interval: 2,
    });
  });

  it('sends only changed fields on edit and null to clear the end date', () => {
    const template = makeTemplate({ endDate: '2027-01-01', note: 'x' });
    const base = {
      ...valid,
      type: template.type,
      name: template.name,
      walletId: template.wallet.id,
      categoryId: template.category.id,
      note: 'x',
      frequency: template.frequency,
      startDate: template.startDate,
      endMode: 'on' as const,
      endDate: '2027-01-01',
    };
    expect(toUpdateRequest(template, base, template.amountMinor, 1)).toEqual({});
    const cleared = toUpdateRequest(
      template,
      { ...base, endMode: 'never' },
      template.amountMinor,
      1,
    );
    expect(cleared).toEqual({ endDate: null });
    expect(toUpdateRequest(template, { ...base, name: 'Flat' }, 1, 1)).toEqual({
      name: 'Flat',
      amountMinor: 1,
    });
  });
});

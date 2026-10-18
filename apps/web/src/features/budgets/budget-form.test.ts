import { describe, expect, it } from 'vitest';
import {
  emptyBudgetForm,
  parseThreshold,
  toCreateRequest,
  toUpdateRequest,
  validateBudgetForm,
} from './budget-form';

const ctx = { locale: 'en-US' };

describe('parseThreshold', () => {
  it('accepts whole numbers from 1 to 99 only', () => {
    expect(parseThreshold('80')).toBe(80);
    expect(parseThreshold(' 1 ')).toBe(1);
    expect(parseThreshold('99')).toBe(99);
    for (const bad of ['', '0', '100', '8.5', '-5', 'abc', '1e1']) {
      expect(parseThreshold(bad), bad).toBeNull();
    }
  });
});

describe('validateBudgetForm', () => {
  it('requires a category for a category budget and a positive amount', () => {
    const values = { ...emptyBudgetForm('USD'), scope: 'category' as const, amount: '0' };
    const { errors } = validateBudgetForm(values, ctx);
    expect(errors.categoryId).toBe('Choose a category.');
    expect(errors.amount).toBe('Enter an amount greater than 0.');
  });

  it('explains too many decimals instead of rounding', () => {
    const values = { ...emptyBudgetForm('USD'), amount: '12.345' };
    expect(validateBudgetForm(values, ctx).errors.amount).toBe('USD has 2 decimal places.');
  });

  it('rejects a threshold outside 1 to 99', () => {
    const values = { ...emptyBudgetForm('USD'), amount: '400', threshold: '100' };
    expect(validateBudgetForm(values, ctx).errors.threshold).toBe(
      'Enter a whole number from 1 to 99.',
    );
  });

  it('passes a valid form and returns minor units', () => {
    const values = { ...emptyBudgetForm('USD'), amount: '400.00' };
    const result = validateBudgetForm(values, ctx);
    expect(result.errors).toEqual({});
    expect(result.amountMinor).toBe(40000);
    expect(result.threshold).toBe(80);
  });
});

describe('requests', () => {
  it('omits the category for an overall budget and includes it for a category budget', () => {
    const overall = toCreateRequest(emptyBudgetForm('EUR'), 5000, 80);
    expect(overall).toEqual({
      scope: 'overall',
      period: 'monthly',
      amountMinor: 5000,
      currency: 'EUR',
      warningThresholdPct: 80,
    });
    const category = toCreateRequest(
      { ...emptyBudgetForm('USD'), scope: 'category', categoryId: 'abc' },
      100,
      90,
    );
    expect(category.categoryId).toBe('abc');
  });

  it('sends only changed fields on edit', () => {
    const budget = { amountMinor: 40000, warningThresholdPct: 80 };
    expect(toUpdateRequest(budget, 40000, 80)).toEqual({});
    expect(toUpdateRequest(budget, 50000, 80)).toEqual({ amountMinor: 50000 });
    expect(toUpdateRequest(budget, 40000, 70)).toEqual({ warningThresholdPct: 70 });
  });
});

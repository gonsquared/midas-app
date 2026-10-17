import { describe, expect, it } from 'vitest';
import { makeCategory } from '@/test/fixtures';
import { disambiguatedLabels, suggestColor, validateCategoryForm } from './category-form';

describe('suggestColor', () => {
  it('picks the first Core color not used by the user for that type', () => {
    expect(suggestColor([], 'expense')).toBe('blue');
    const mine = [
      makeCategory({ system: false, type: 'expense', color: 'blue' }),
      makeCategory({ system: false, type: 'expense', color: 'yellow' }),
      makeCategory({ system: false, type: 'income', color: 'pink' }),
      makeCategory({ system: true, type: 'expense', color: 'pink' }),
    ];
    expect(suggestColor(mine, 'expense')).toBe('pink');
    expect(suggestColor(mine, 'income')).toBe('blue');
  });

  it('wraps after the eight Core colors', () => {
    const core = ['blue', 'yellow', 'pink', 'green', 'violet', 'orange', 'teal', 'red'] as const;
    const mine = core.map((color) => makeCategory({ system: false, type: 'expense', color }));
    expect(suggestColor(mine, 'expense')).toBe('blue');
  });
});

describe('validateCategoryForm', () => {
  it('requires a trimmed name, a color and an icon', () => {
    expect(validateCategoryForm({ name: ' ', type: 'expense', color: null, icon: null })).toEqual({
      name: 'Enter a name.',
      color: 'Choose a color.',
      icon: 'Choose an icon.',
    });
    expect(
      validateCategoryForm({ name: 'x'.repeat(41), type: 'expense', color: 'blue', icon: 'tag' }),
    ).toEqual({ name: 'Use 40 characters or fewer.' });
    expect(
      validateCategoryForm({ name: 'Pets', type: 'expense', color: 'teal', icon: 'paw-print' }),
    ).toEqual({});
  });
});

describe('disambiguatedLabels', () => {
  it('suffixes only names shared by a user category and a default', () => {
    const own = makeCategory({ name: 'Groceries', system: false });
    const def = makeCategory({ name: 'groceries', system: true });
    const other = makeCategory({ name: 'Rent', system: true });
    const labels = disambiguatedLabels([own, def, other]);
    expect(labels.get(own.id)).toBe('Groceries (yours)');
    expect(labels.get(def.id)).toBe('groceries (default)');
    expect(labels.get(other.id)).toBe('Rent');
  });
});

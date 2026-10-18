import type { CategoryType } from '@midas/shared';

export interface CategoriesSearch {
  /** Selects the tab below 1024px and presets the type for Create category. */
  type?: CategoryType;
}

export function parseCategoriesSearch(raw: Record<string, unknown>): CategoriesSearch {
  const value = raw['type'];
  return value === 'expense' || value === 'income' ? { type: value } : {};
}

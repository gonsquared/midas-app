import type { Category, CategoryColor, CategoryIcon, CategoryType } from '@midas/shared';
import { CATEGORY_COLOR_KEYS, CATEGORY_NAME_MAX_LENGTH } from '@midas/shared/categories';

export interface CategoryFormValues {
  name: string;
  type: CategoryType;
  color: CategoryColor | null;
  icon: CategoryIcon | null;
}

export type CategoryFormErrors = Partial<Record<keyof CategoryFormValues, string>>;

const FORBIDDEN_NAME_CHARS = /[\p{Cc}\p{Cf}]/u;
const CORE_COLORS = CATEGORY_COLOR_KEYS.slice(0, 8);

/**
 * Suggested color for a new category: the first Core color not yet used by the user's own
 * categories of the same type, wrapping after eight (ui-design 13.3, 18.2.6).
 */
export function suggestColor(
  existing: readonly Pick<Category, 'type' | 'color' | 'system'>[],
  type: CategoryType,
): CategoryColor {
  const mine = existing.filter((category) => !category.system && category.type === type);
  const used = new Set(mine.map((category) => category.color));
  const free = CORE_COLORS.find((color) => !used.has(color));
  return free ?? CORE_COLORS[mine.length % CORE_COLORS.length] ?? 'blue';
}

export function validateCategoryForm(values: CategoryFormValues): CategoryFormErrors {
  const errors: CategoryFormErrors = {};
  const name = values.name.trim();
  if (!name) errors.name = 'Enter a name.';
  else if (name.length > CATEGORY_NAME_MAX_LENGTH) {
    errors.name = `Use ${CATEGORY_NAME_MAX_LENGTH} characters or fewer.`;
  } else if (FORBIDDEN_NAME_CHARS.test(name)) {
    errors.name = 'Remove special or invisible characters.';
  }
  if (!values.color) errors.color = 'Choose a color.';
  if (!values.icon) errors.icon = 'Choose an icon.';
  return errors;
}

/** "Groceries (yours)" and "Groceries (default)" when a user category shares a name with a default. */
export function disambiguatedLabels(
  categories: readonly Pick<Category, 'id' | 'name' | 'system'>[],
): Map<string, string> {
  const counts = new Map<string, number>();
  for (const category of categories) {
    const key = category.name.trim().toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const labels = new Map<string, string>();
  for (const category of categories) {
    const shared = (counts.get(category.name.trim().toLowerCase()) ?? 0) > 1;
    labels.set(
      category.id,
      shared ? `${category.name} (${category.system ? 'default' : 'yours'})` : category.name,
    );
  }
  return labels;
}

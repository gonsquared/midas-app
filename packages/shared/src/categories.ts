import { z } from 'zod';
import { CategoryTypeSchema } from './enums.js';
import { booleanQuery } from './query.js';

/**
 * Category icon allowlist (UI design 13.4, confirmed by E4-F1-S2). Keys are Lucide icon names in
 * kebab case, in picker order. Stored values are keys only; the database checks the key shape
 * (`ck_categories__icon`), and services and the system seed validate membership here. Removing a
 * key later never invalidates stored rows: unknown keys render as `tag`.
 */
export const CATEGORY_ICONS = [
  // Money and work
  'briefcase',
  'laptop',
  'store',
  'trending-up',
  'percent',
  'circle-plus',
  'rotate-ccw',
  'wallet',
  'banknote',
  'coins',
  'piggy-bank',
  'credit-card',
  'landmark',
  'receipt',
  'building-2',
  'handshake',
  'trophy',
  // Home and bills
  'house',
  'zap',
  'wifi',
  'droplet',
  'flame',
  'lightbulb',
  'sofa',
  'wrench',
  'hammer',
  'smartphone',
  'tv',
  // Food and drink
  'shopping-cart',
  'utensils',
  'coffee',
  'beer',
  'wine',
  'pizza',
  'apple',
  // Transport
  'bus',
  'fuel',
  'car',
  'bike',
  'train-front',
  'plane',
  'luggage',
  'map-pin',
  // Health and family
  'heart-pulse',
  'shield',
  'stethoscope',
  'pill',
  'dumbbell',
  'baby',
  'paw-print',
  'heart',
  'hand-heart',
  // Leisure and learning
  'film',
  'graduation-cap',
  'book-open',
  'gamepad-2',
  'music',
  'camera',
  'ticket',
  'umbrella',
  'leaf',
  // Shopping and personal
  'shopping-bag',
  'sparkles',
  'gift',
  'shirt',
  'scissors',
  'repeat',
  // General
  'circle-ellipsis',
  'calendar',
  'tag',
] as const;
export const CategoryIconSchema = z.enum(CATEGORY_ICONS);
export type CategoryIcon = z.infer<typeof CategoryIconSchema>;
export const FALLBACK_CATEGORY_ICON: CategoryIcon = 'tag';

/**
 * Category color keys (UI design 13.2). The first eight are the Core set in chart and
 * auto-assignment order; the last six are Extended.
 */
export const CATEGORY_COLOR_KEYS = [
  'blue',
  'yellow',
  'pink',
  'green',
  'violet',
  'orange',
  'teal',
  'red',
  'amber',
  'lime',
  'cyan',
  'indigo',
  'brown',
  'slate',
] as const;
export const CategoryColorSchema = z.enum(CATEGORY_COLOR_KEYS);
export type CategoryColor = z.infer<typeof CategoryColorSchema>;
export const FALLBACK_CATEGORY_COLOR: CategoryColor = 'slate';

export interface CategoryColorToken {
  label: string;
  light: string;
  dark: string;
  group: 'core' | 'extended';
}

/** Palette values per key (UI design 13.2). Hex values live here, never in the database. */
export const CATEGORY_COLORS: Readonly<Record<CategoryColor, CategoryColorToken>> = {
  blue: { label: 'Blue', light: '#2358C4', dark: '#3987E5', group: 'core' },
  yellow: { label: 'Yellow', light: '#8A6D00', dark: '#C98500', group: 'core' },
  pink: { label: 'Pink', light: '#BF2F78', dark: '#D55181', group: 'core' },
  green: { label: 'Green', light: '#1F7A3E', dark: '#3AA14A', group: 'core' },
  violet: { label: 'Violet', light: '#7A3FC4', dark: '#9085E9', group: 'core' },
  orange: { label: 'Orange', light: '#C4560C', dark: '#D95926', group: 'core' },
  teal: { label: 'Teal', light: '#00836F', dark: '#1AA08A', group: 'core' },
  red: { label: 'Red', light: '#C0352B', dark: '#E66767', group: 'core' },
  amber: { label: 'Amber', light: '#A85F00', dark: '#D07A12', group: 'extended' },
  lime: { label: 'Lime', light: '#587A0E', dark: '#7FA832', group: 'extended' },
  cyan: { label: 'Cyan', light: '#0B7A9A', dark: '#1E9DC6', group: 'extended' },
  indigo: { label: 'Indigo', light: '#4B45C8', dark: '#7A74E6', group: 'extended' },
  brown: { label: 'Brown', light: '#8A5A3C', dark: '#A8754F', group: 'extended' },
  slate: { label: 'Slate', light: '#55646E', dark: '#7F929D', group: 'extended' },
};

// --- Category API (api-contract 2.8, 2.9 and 7) ---

export const CATEGORY_NAME_MAX_LENGTH = 40;
export const CATEGORY_LIMIT = 200;

const FORBIDDEN_CATEGORY_NAME_CHARS = /[\p{Cc}\p{Cf}]/u;
export const CategoryNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(CATEGORY_NAME_MAX_LENGTH)
  .refine((value) => !FORBIDDEN_CATEGORY_NAME_CHARS.test(value), {
    message: 'Must not contain control or invisible formatting characters.',
  });

/**
 * Response icon and color keys are plain strings: stored rows may hold keys that were later
 * removed from the allowlists (clients render a fallback), so responses must not fail to parse.
 */
export const CategoryRefSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  type: CategoryTypeSchema,
  icon: z.string(),
  color: z.string(),
  system: z.boolean(),
  retired: z.boolean(),
});
export type CategoryRef = z.infer<typeof CategoryRefSchema>;

export const CategorySchema = CategoryRefSchema.extend({
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Category = z.infer<typeof CategorySchema>;

export const CategoryListResponseSchema = z.object({ items: z.array(CategorySchema) });

export const ListCategoriesQuerySchema = z.strictObject({
  type: CategoryTypeSchema.optional(),
  includeRetired: booleanQuery.default(false),
});

export const CreateCategoryRequestSchema = z.strictObject({
  name: CategoryNameSchema,
  type: CategoryTypeSchema,
  icon: CategoryIconSchema,
  color: CategoryColorSchema,
});
export type CreateCategoryRequest = z.infer<typeof CreateCategoryRequestSchema>;

export const UpdateCategoryRequestSchema = z.strictObject({
  name: CategoryNameSchema.optional(),
  icon: CategoryIconSchema.optional(),
  color: CategoryColorSchema.optional(),
});
export type UpdateCategoryRequest = z.infer<typeof UpdateCategoryRequestSchema>;

export const CategoryIdParamsSchema = z.strictObject({ categoryId: z.uuid() });
export const DeleteCategoryQuerySchema = z.strictObject({ reassignTo: z.uuid().optional() });

export const DeleteCategoryResponseSchema = z.object({
  reassignedTransactions: z.number().int(),
  reassignedTemplates: z.number().int(),
  deletedBudgets: z.number().int(),
});
export type DeleteCategoryResponse = z.infer<typeof DeleteCategoryResponseSchema>;

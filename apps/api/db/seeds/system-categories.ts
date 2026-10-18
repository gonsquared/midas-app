import {
  CATEGORY_COLOR_KEYS,
  CATEGORY_ICONS,
  CATEGORY_TYPES,
  type CategoryType,
} from '@midas/shared';
import type { Kysely } from 'kysely';
import { v7 as uuidv7 } from 'uuid';
import type { Database } from '../../src/platform/db/database.js';

/**
 * System categories (database design notes 12.1; icons and colors confirmed in UI design 13.5).
 * System rows are shared by every user (owner_user_id IS NULL), never copied per user, so a new
 * user sees them immediately and registration inserts nothing into `categories`.
 *
 * To add a default, append an entry with a new `systemKey` and rerun `cli seed:system`.
 * Never change or reuse an existing key: keys identify rows across environments.
 */
export interface SystemCategorySeed {
  systemKey: string;
  name: string;
  type: string;
  icon: string;
  color: string;
}

const income = (systemKey: string, name: string, icon: string, color: string) =>
  ({ systemKey, name, type: 'income', icon, color }) satisfies SystemCategorySeed;
const expense = (systemKey: string, name: string, icon: string, color: string) =>
  ({ systemKey, name, type: 'expense', icon, color }) satisfies SystemCategorySeed;

export const SYSTEM_CATEGORIES: readonly SystemCategorySeed[] = [
  income('income.salary', 'Salary', 'briefcase', 'green'),
  income('income.freelance', 'Freelance', 'laptop', 'teal'),
  income('income.business', 'Business', 'store', 'cyan'),
  income('income.investments', 'Investments', 'trending-up', 'indigo'),
  income('income.interest', 'Interest', 'percent', 'blue'),
  income('income.gifts', 'Gifts received', 'gift', 'pink'),
  income('income.refunds', 'Refunds', 'rotate-ccw', 'lime'),
  income('income.other', 'Other income', 'circle-plus', 'slate'),
  expense('expense.groceries', 'Groceries', 'shopping-cart', 'green'),
  expense('expense.dining', 'Dining out', 'utensils', 'orange'),
  expense('expense.housing', 'Housing', 'house', 'indigo'),
  expense('expense.utilities', 'Utilities', 'zap', 'yellow'),
  expense('expense.transport', 'Transport', 'bus', 'blue'),
  expense('expense.fuel', 'Fuel', 'fuel', 'amber'),
  expense('expense.health', 'Health', 'heart-pulse', 'red'),
  expense('expense.insurance', 'Insurance', 'shield', 'slate'),
  expense('expense.entertainment', 'Entertainment', 'film', 'violet'),
  expense('expense.shopping', 'Shopping', 'shopping-bag', 'pink'),
  expense('expense.travel', 'Travel', 'plane', 'cyan'),
  expense('expense.education', 'Education', 'graduation-cap', 'teal'),
  expense('expense.subscriptions', 'Subscriptions', 'repeat', 'indigo'),
  expense('expense.phone_internet', 'Phone and internet', 'wifi', 'blue'),
  expense('expense.personal_care', 'Personal care', 'sparkles', 'pink'),
  expense('expense.gifts_donations', 'Gifts and donations', 'gift', 'red'),
  expense('expense.kids', 'Kids', 'baby', 'amber'),
  expense('expense.pets', 'Pets', 'paw-print', 'orange'),
  expense('expense.fees', 'Fees and charges', 'receipt', 'slate'),
  expense('expense.taxes', 'Taxes', 'landmark', 'slate'),
  expense('expense.other', 'Other expense', 'circle-ellipsis', 'slate'),
];

export class SeedValidationError extends Error {
  constructor(readonly problems: string[]) {
    super(`System category seed is invalid:\n  - ${problems.join('\n  - ')}`);
    this.name = 'SeedValidationError';
  }
}

// Mirrors ck_categories__system_key, ck_categories__name and ck_categories__type.
const SYSTEM_KEY = /^(income|expense)[.][a-z0-9_]{1,40}$/;
const icons: ReadonlySet<string> = new Set(CATEGORY_ICONS);
const colors: ReadonlySet<string> = new Set(CATEGORY_COLOR_KEYS);
const types: ReadonlySet<string> = new Set(CATEGORY_TYPES);

/**
 * Fails fast, before touching the database, if an entry would violate a database check or uses an
 * icon or color missing from the `@midas/shared` allowlists (database design notes 12.1).
 */
export function validateSystemCategories(entries: readonly SystemCategorySeed[]): void {
  const problems: string[] = [];
  const keys = new Set<string>();
  const names = new Set<string>();
  for (const e of entries) {
    const at = e.systemKey || '(missing key)';
    if (!SYSTEM_KEY.test(e.systemKey)) problems.push(`${at}: key must match ${SYSTEM_KEY}`);
    if (!types.has(e.type)) problems.push(`${at}: unknown type "${e.type}"`);
    else if (!e.systemKey.startsWith(`${e.type}.`)) {
      problems.push(`${at}: key prefix must equal the type "${e.type}"`);
    }
    if (e.name !== e.name.trim() || e.name.length < 1 || e.name.length > 40) {
      problems.push(`${at}: name must be trimmed and 1 to 40 characters`);
    }
    if (!icons.has(e.icon)) problems.push(`${at}: icon "${e.icon}" is not in CATEGORY_ICONS`);
    if (!colors.has(e.color)) {
      problems.push(`${at}: color "${e.color}" is not in CATEGORY_COLOR_KEYS`);
    }
    if (keys.has(e.systemKey)) problems.push(`${at}: duplicate key`);
    keys.add(e.systemKey);
    const nameKey = `${e.type}:${e.name.toLowerCase()}`;
    if (names.has(nameKey)) problems.push(`${at}: duplicate ${e.type} name "${e.name}"`);
    names.add(nameKey);
  }
  if (problems.length > 0) throw new SeedValidationError(problems);
}

export interface SeedLogger {
  info(message: string): void;
  warn(message: string): void;
}

export interface SystemSeedResult {
  /** Keys inserted by this run. */
  inserted: string[];
  /** Keys already present, left untouched (including admin edits and retirement). */
  existing: string[];
  /** Keys skipped because an unkeyed active system category already has the same type and name. */
  nameCollisions: string[];
}

/**
 * Idempotent: one `INSERT … ON CONFLICT DO NOTHING` statement keyed by `system_key`. Existing rows
 * are never updated, retired or deleted, so admin edits survive reruns, and concurrent runs are
 * safe. Run with the owner connection (`DATABASE_MIGRATION_URL`).
 */
export async function seedSystemCategories(
  db: Kysely<Database>,
  options: { entries?: readonly SystemCategorySeed[]; logger?: SeedLogger } = {},
): Promise<SystemSeedResult> {
  const entries = options.entries ?? SYSTEM_CATEGORIES;
  validateSystemCategories(entries);
  if (entries.length === 0) return { inserted: [], existing: [], nameCollisions: [] };

  const rows = await db
    .insertInto('categories')
    .values(
      entries.map((e) => ({
        id: uuidv7(),
        ownerUserId: null,
        systemKey: e.systemKey,
        name: e.name,
        type: e.type as CategoryType,
        icon: e.icon,
        color: e.color,
      })),
    )
    // No conflict target on purpose: skips both a taken system_key (uq_categories__system_key)
    // and a taken active system name (uq_categories__system_type_name_active).
    .onConflict((oc) => oc.doNothing())
    .returning('systemKey')
    .execute();

  const insertedKeys = new Set(rows.map((r) => r.systemKey));
  const skipped = entries.map((e) => e.systemKey).filter((k) => !insertedKeys.has(k));
  const presentKeys = new Set<string | null>();
  if (skipped.length > 0) {
    const present = await db
      .selectFrom('categories')
      .select('systemKey')
      .where('systemKey', 'in', skipped)
      .execute();
    for (const r of present) presentKeys.add(r.systemKey);
  }

  const result: SystemSeedResult = {
    inserted: entries.map((e) => e.systemKey).filter((k) => insertedKeys.has(k)),
    existing: skipped.filter((k) => presentKeys.has(k)),
    nameCollisions: skipped.filter((k) => !presentKeys.has(k)),
  };
  for (const key of result.nameCollisions) {
    options.logger?.warn(
      `seed:system skipped ${key}: an active system category with the same type and name exists`,
    );
  }
  options.logger?.info(
    `seed:system: ${result.inserted.length} inserted, ${result.existing.length} already present, ` +
      `${result.nameCollisions.length} skipped (name taken).`,
  );
  return result;
}

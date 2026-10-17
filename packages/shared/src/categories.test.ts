import { describe, expect, it } from 'vitest';
import {
  CATEGORY_COLOR_KEYS,
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  FALLBACK_CATEGORY_COLOR,
  FALLBACK_CATEGORY_ICON,
} from './categories.js';

// Same shape as the database checks ck_categories__icon and ck_categories__color.
const DB_KEY_SHAPE = /^[a-z0-9-]{1,40}$/;

describe('category allowlists', () => {
  it('has 70 unique icon keys that fit the database key shape', () => {
    expect(CATEGORY_ICONS).toHaveLength(70);
    expect(new Set(CATEGORY_ICONS).size).toBe(CATEGORY_ICONS.length);
    for (const key of CATEGORY_ICONS) expect(key).toMatch(DB_KEY_SHAPE);
    expect(CATEGORY_ICONS).toContain(FALLBACK_CATEGORY_ICON);
  });

  it('has 14 unique color keys with a palette entry each, core colors first', () => {
    expect(CATEGORY_COLOR_KEYS).toHaveLength(14);
    expect(new Set(CATEGORY_COLOR_KEYS).size).toBe(CATEGORY_COLOR_KEYS.length);
    expect(Object.keys(CATEGORY_COLORS).sort()).toEqual([...CATEGORY_COLOR_KEYS].sort());
    for (const key of CATEGORY_COLOR_KEYS) {
      expect(key).toMatch(DB_KEY_SHAPE);
      expect(CATEGORY_COLORS[key].light).toMatch(/^#[0-9A-F]{6}$/);
      expect(CATEGORY_COLORS[key].dark).toMatch(/^#[0-9A-F]{6}$/);
    }
    const groups = CATEGORY_COLOR_KEYS.map((key) => CATEGORY_COLORS[key].group);
    expect(groups.slice(0, 8).every((g) => g === 'core')).toBe(true);
    expect(groups.slice(8).every((g) => g === 'extended')).toBe(true);
    expect(CATEGORY_COLOR_KEYS).toContain(FALLBACK_CATEGORY_COLOR);
  });
});

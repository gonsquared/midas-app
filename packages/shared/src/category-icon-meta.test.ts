import { describe, expect, it } from 'vitest';
import { CATEGORY_ICONS } from './categories.js';
import { CATEGORY_ICON_GROUPS, CATEGORY_ICON_META } from './category-icon-meta.js';

describe('CATEGORY_ICON_META', () => {
  it('covers exactly the icon allowlist', () => {
    expect(Object.keys(CATEGORY_ICON_META).sort()).toEqual([...CATEGORY_ICONS].sort());
  });

  it('has a short label, 3 to 6 keywords and a known group for every icon', () => {
    for (const icon of CATEGORY_ICONS) {
      const meta = CATEGORY_ICON_META[icon];
      expect(meta.label.length, icon).toBeGreaterThan(0);
      expect(meta.label.length, icon).toBeLessThan(24);
      expect(meta.keywords.length, icon).toBeGreaterThanOrEqual(3);
      expect(meta.keywords.length, icon).toBeLessThanOrEqual(6);
      expect(CATEGORY_ICON_GROUPS as readonly string[], icon).toContain(meta.group);
    }
  });

  it('lists icons grouped in allowlist order', () => {
    const order = CATEGORY_ICONS.map((icon) => CATEGORY_ICON_META[icon].group);
    const seen = [...new Set(order)];
    expect(seen).toEqual([...CATEGORY_ICON_GROUPS]);
  });
});

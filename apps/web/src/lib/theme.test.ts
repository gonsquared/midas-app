import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { THEME_STORAGE_KEY, readStoredPreference, resolveTheme, storePreference } from './theme';

describe('theme helpers', () => {
  it('resolves system from the OS preference and passes explicit choices through', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('defaults to system when nothing or garbage is stored', () => {
    expect(readStoredPreference()).toBe('system');
    localStorage.setItem(THEME_STORAGE_KEY, 'garbage');
    expect(readStoredPreference()).toBe('system');
  });

  it('round-trips a stored preference', () => {
    storePreference('dark');
    expect(readStoredPreference()).toBe('dark');
  });
});

describe('public/theme-init.js (runs before first paint)', () => {
  const source = readFileSync(resolve(process.cwd(), 'public/theme-init.js'), 'utf8');
  const run = (stored: string | null, systemDark: boolean): string | null => {
    document.documentElement.removeAttribute('data-theme');
    localStorage.clear();
    if (stored) localStorage.setItem(THEME_STORAGE_KEY, stored);
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({ matches: systemDark, media: query })) as never;
    try {
      // Test-only: evaluates the static, repo-owned bootstrap file to prove it matches resolveTheme.
      new Function(source)();
    } finally {
      window.matchMedia = original;
    }
    return document.documentElement.getAttribute('data-theme');
  };

  it('applies the stored explicit theme', () => {
    expect(run('dark', false)).toBe('dark');
  });

  it('follows the OS when no preference or system is stored', () => {
    expect(run(null, true)).toBe('dark');
    expect(run('system', false)).toBe('light');
  });

  it('ignores invalid stored values', () => {
    expect(run('neon', false)).toBe('light');
  });

  it('agrees with resolveTheme for every combination', () => {
    for (const stored of ['light', 'dark', 'system'] as const) {
      for (const dark of [true, false]) {
        expect(run(stored, dark)).toBe(resolveTheme(stored, dark));
      }
    }
  });
});

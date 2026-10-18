import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// QA gate E7-F2-S3 "theme aware": every color custom property a chart or meter uses must exist
// in both the light theme and the dark override, and no raw hex colors may be hard-coded.
const root = join(import.meta.dirname, '..', '..');
const css = readFileSync(join(root, 'styles', 'tokens.css'), 'utf8');
const darkStart = css.search(/^\[data-theme='dark'\] \{/m);
const light = css.slice(0, darkStart);
const dark = css.slice(darkStart);

function sourceFiles(dir: string): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true })
    .filter((e) => e.isFile() && /\.tsx$/.test(e.name) && !/\.test\./.test(e.name))
    .map((e) => join(root, dir, e.name));
}

const chartFiles = [
  ...sourceFiles('features/reports'),
  ...sourceFiles('features/budgets'),
  ...sourceFiles('features/dashboard'),
];

describe('chart and meter colors follow the theme', () => {
  it('has chart sources to check', () => {
    expect(chartFiles.length).toBeGreaterThan(5);
    expect(darkStart).toBeGreaterThan(0);
  });

  it('defines every var(--color-*) used by charts, meters and the dashboard for light and dark', () => {
    const used = new Set<string>();
    for (const file of chartFiles) {
      for (const m of readFileSync(file, 'utf8').matchAll(/var\((--color-[a-z0-9-]+)\)/g)) {
        used.add(m[1]!);
      }
    }
    expect(used.size).toBeGreaterThan(3);
    for (const name of used) {
      expect(light, name + ' missing in the light theme').toContain(name + ':');
    }
    const darkOverrides = [
      '--color-series-income',
      '--color-series-expense',
      '--color-grid',
      '--color-axis',
    ];
    for (const name of darkOverrides) {
      expect(dark, name + ' missing in the dark theme').toContain(name + ':');
    }
  });

  it('hard-codes no hex colors in chart components', () => {
    for (const file of chartFiles) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/(fill|stroke|color)\s*[=:]\s*["']#[0-9a-fA-F]{3,8}["']/);
    }
  });
});

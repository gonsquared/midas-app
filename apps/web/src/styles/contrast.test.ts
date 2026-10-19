import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * E10-F2-S3 (WCAG 2.1 AA, 1.4.3 text contrast and 1.4.11 non-text contrast): the design tokens in
 * tokens.css are checked in both themes. The ratios are computed from the real stylesheet, so a
 * token edit that breaks contrast fails here. Rendered contrast (axe on every route) is in
 * e2e/tests/a11y.spec.ts.
 */
const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'tokens.css'), 'utf8');

function block(source: string, opener: RegExp): string {
  const start = source.search(opener);
  expect(start, `block ${String(opener)} in tokens.css`).toBeGreaterThanOrEqual(0);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error('unbalanced braces in tokens.css');
}

function colors(body: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const match of body.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    map.set(match[1]!, match[2]!.toLowerCase());
  }
  return map;
}

const light = colors(block(css, /@theme static/));
const dark = new Map([...light, ...colors(block(css, /\[data-theme='dark'\]\s*\{/))]);

type Rgb = [number, number, number];
const toRgb = (hex: string): Rgb => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];
const channel = (v: number) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: Rgb) =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
function ratio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
/** color-mix(in srgb, token pct%, surface), the tint formula in tokens.css. */
const tint = (token: Rgb, surface: Rgb, pct = 0.12): Rgb =>
  token.map((c, i) => c * pct + surface[i]! * (1 - pct)) as Rgb;

const themes = { light, dark } as const;

interface Pair {
  fg: string;
  bg: string;
  min: number;
  why: string;
}
const TEXT = 4.5;
const GRAPHIC = 3;

/** Foreground/background pairs the UI actually renders. */
const PAIRS: Pair[] = [
  ...['canvas', 'surface', 'raised'].flatMap((bg) =>
    ['ink', 'ink-2', 'ink-3', 'primary', 'income', 'danger', 'warning', 'info'].map((fg) => ({
      fg,
      bg,
      min: TEXT,
      why: 'text',
    })),
  ),
  { fg: 'ink', bg: 'sunken', min: TEXT, why: 'text on wells' },
  { fg: 'ink-2', bg: 'sunken', min: TEXT, why: 'text on wells' },
  { fg: 'ink-3', bg: 'sunken', min: TEXT, why: 'captions on wells' },
  { fg: 'on-primary', bg: 'primary', min: TEXT, why: 'primary button label' },
  { fg: 'on-danger', bg: 'danger', min: TEXT, why: 'destructive button label' },
  { fg: 'ink', bg: 'primary-tint', min: TEXT, why: 'selected row' },
  { fg: 'primary', bg: 'primary-tint', min: TEXT, why: 'selected nav item' },
  { fg: 'line-strong', bg: 'surface', min: GRAPHIC, why: 'input borders (1.4.11)' },
  { fg: 'line-strong', bg: 'canvas', min: GRAPHIC, why: 'control outlines (1.4.11)' },
  { fg: 'focus-ring', bg: 'canvas', min: GRAPHIC, why: 'focus indicator (2.4.7)' },
  { fg: 'focus-ring', bg: 'surface', min: GRAPHIC, why: 'focus indicator (2.4.7)' },
  { fg: 'focus-ring', bg: 'raised', min: GRAPHIC, why: 'focus indicator inside dialogs' },
  { fg: 'warning-mark', bg: 'surface', min: GRAPHIC, why: 'meter fill (1.4.11)' },
  { fg: 'brass', bg: 'surface', min: GRAPHIC, why: 'markers, never text' },
  { fg: 'series-income', bg: 'surface', min: GRAPHIC, why: 'chart series' },
  { fg: 'series-expense', bg: 'surface', min: GRAPHIC, why: 'chart series' },
  { fg: 'series-net', bg: 'surface', min: GRAPHIC, why: 'chart series' },
  { fg: 'series-other', bg: 'surface', min: GRAPHIC, why: 'chart series' },
];

/** Alert and badge text on the 12% semantic tints. */
const TINT_PAIRS = ['danger', 'warning', 'info', 'success'] as const;

describe.each(Object.keys(themes) as Array<keyof typeof themes>)('%s theme contrast', (name) => {
  const tokens = themes[name];
  const get = (token: string): Rgb => {
    const hex = tokens.get(token);
    expect(hex, `token --color-${token} in the ${name} theme`).toBeDefined();
    return toRgb(hex!);
  };

  it.each(PAIRS)('$fg on $bg is at least $min:1 ($why)', ({ fg, bg, min }) => {
    expect(ratio(get(fg), get(bg))).toBeGreaterThanOrEqual(min);
  });

  it.each(TINT_PAIRS)('%s text on its own 12% tint over surface is at least 4.5:1', (token) => {
    const background = tint(get(token), get('surface'));
    expect(ratio(get(token), background)).toBeGreaterThanOrEqual(TEXT);
    expect(ratio(get('ink'), background)).toBeGreaterThanOrEqual(TEXT);
  });

  it('every checked ratio is printed for the audit table', () => {
    const rows = PAIRS.map((p) => `${p.fg}/${p.bg}=${ratio(get(p.fg), get(p.bg)).toFixed(2)}`);
    expect(rows.length).toBeGreaterThan(20);
    if (process.env['PRINT_CONTRAST'])
      process.stdout.write(`[contrast ${name}] ${rows.join(' ')}\n`);
  });
});

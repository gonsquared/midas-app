import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * E10-F1-S4 (no unsafe HTML injection, token storage): a source scan that fails when production
 * code starts to inject raw HTML, evaluate strings, or put a credential in web storage. It is the
 * guard for the review finding "no lint rule for dangerouslySetInnerHTML". Test files are skipped.
 */
const SRC = resolve(process.cwd(), 'src');

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

const files = sources(SRC).map((path) => ({
  name: relative(SRC, path).replaceAll('\\', '/'),
  text: readFileSync(path, 'utf8'),
}));

describe('production source has no raw HTML or string evaluation', () => {
  it('scans a realistic number of files', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it.each([
    ['dangerouslySetInnerHTML', /dangerouslySetInnerHTML/],
    ['innerHTML / outerHTML assignment', /\.(inner|outer)HTML\s*=/],
    ['insertAdjacentHTML', /insertAdjacentHTML/],
    ['document.write', /document\.write\s*\(/],
    ['eval()', /(^|[^.\w])eval\s*\(/],
    ['new Function()', /new\s+Function\s*\(/],
    ['setTimeout or setInterval with a string', /set(Timeout|Interval)\s*\(\s*['"`]/],
  ])('%s is not used', (_name, pattern) => {
    const offenders = files.filter((file) => pattern.test(file.text)).map((file) => file.name);
    expect(offenders).toEqual([]);
  });
});

describe('credentials stay out of web storage', () => {
  it('only the theme preference and the last wallet id are written to localStorage', () => {
    const writers = files
      .filter((file) => /(local|session)Storage\.setItem/.test(file.text))
      .map((file) => file.name)
      .sort();
    expect(writers).toEqual(['features/transactions/last-wallet.ts', 'lib/theme.ts']);
  });

  it('no storage key or cookie write mentions a token', () => {
    const offenders = files
      .filter((file) =>
        /(local|session)Storage\.setItem\([^)]*(token|jwt|refresh|access)/i.test(file.text),
      )
      .map((file) => file.name);
    expect(offenders).toEqual([]);
    expect(files.filter((file) => /document\.cookie\s*=/.test(file.text))).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { parseArgs, parseCount } from './cli-args.js';

describe('parseArgs', () => {
  it('parses command, positionals and flags', () => {
    const parsed = parseArgs(['migrate:down', '--count', '2', '--confirm-production']);
    expect(parsed.command).toBe('migrate:down');
    expect(parsed.flags.get('count')).toBe('2');
    expect(parsed.flags.get('confirm-production')).toBe(true);
  });

  it('ignores the pnpm -- separator and keeps positionals', () => {
    const parsed = parseArgs(['migrate:create', '--', 'create-wallets']);
    expect(parsed.positionals).toEqual(['create-wallets']);
  });
});

describe('parseCount', () => {
  it('defaults to 1 and validates', () => {
    expect(parseCount(undefined)).toBe(1);
    expect(parseCount('3')).toBe(3);
    expect(() => parseCount('0')).toThrow();
    expect(() => parseCount('abc')).toThrow();
    expect(() => parseCount(true)).toThrow();
  });
});

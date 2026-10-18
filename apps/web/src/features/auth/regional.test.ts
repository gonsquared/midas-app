import { describe, expect, it } from 'vitest';
import { describeRegional, detectRegionalDefaults, matchLocale } from './regional';

describe('matchLocale', () => {
  it('prefers an exact match, then the same language, then en-US', () => {
    expect(matchLocale('de-AT')).toBe('de-AT');
    expect(matchLocale('de-LU')).toBe('de-DE');
    expect(matchLocale('en-NZ')).toBe('en-US');
    expect(matchLocale('xx')).toBe('en-US');
    expect(matchLocale(undefined)).toBe('en-US');
  });
});

describe('detectRegionalDefaults', () => {
  it('derives currency from the region and keeps a supported zone', () => {
    expect(detectRegionalDefaults('en-GB', 'Europe/London')).toEqual({
      currency: 'GBP',
      locale: 'en-GB',
      timezone: 'Europe/London',
    });
    expect(detectRegionalDefaults('fr-FR', 'Europe/Paris').currency).toBe('EUR');
  });

  it('falls back to UTC for unknown zones and USD for unknown regions', () => {
    expect(detectRegionalDefaults('en-US', 'Mars/Olympus')).toEqual({
      currency: 'USD',
      locale: 'en-US',
      timezone: 'UTC',
    });
    expect(detectRegionalDefaults('hi-IN', undefined).currency).toBe('INR');
  });
});

describe('describeRegional', () => {
  it('writes the values out in one line', () => {
    const text = describeRegional({ currency: 'USD', locale: 'en-US', timezone: 'UTC' });
    expect(text).toContain('United States');
    expect(text).toContain('USD');
    expect(text).toContain('en-US');
  });
});

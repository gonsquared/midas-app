import { SUPPORTED_CURRENCIES, SUPPORTED_LOCALES } from '@midas/shared/locale';

export interface RegionalDefaults {
  currency: string;
  locale: string;
  timezone: string;
}

const FALLBACK: RegionalDefaults = { currency: 'USD', locale: 'en-US', timezone: 'UTC' };

const REGION_CURRENCY: Record<string, string> = {
  US: 'USD',
  GB: 'GBP',
  AU: 'AUD',
  CA: 'CAD',
  IN: 'INR',
  CH: 'CHF',
  MX: 'MXN',
  BR: 'BRL',
  SE: 'SEK',
  NO: 'NOK',
  DK: 'DKK',
  PL: 'PLN',
  CZ: 'CZK',
  TR: 'TRY',
  JP: 'JPY',
  KR: 'KRW',
  CN: 'CNY',
  TW: 'TWD',
  ID: 'IDR',
  DE: 'EUR',
  AT: 'EUR',
  FR: 'EUR',
  ES: 'EUR',
  IT: 'EUR',
  NL: 'EUR',
  FI: 'EUR',
  PT: 'EUR',
};

/** Picks a supported locale for a browser language tag (exact match, then same language). */
export function matchLocale(tag: string | undefined): string {
  if (!tag) return FALLBACK.locale;
  const exact = SUPPORTED_LOCALES.find((locale) => locale.toLowerCase() === tag.toLowerCase());
  if (exact) return exact;
  const language = tag.split('-')[0]?.toLowerCase();
  return SUPPORTED_LOCALES.find((locale) => locale.split('-')[0] === language) ?? FALLBACK.locale;
}

function isSupportedTimeZone(zone: string | undefined): zone is string {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone === 'UTC' || Intl.supportedValuesOf('timeZone').includes(zone);
  } catch {
    return false;
  }
}

/** Regional defaults suggested from the browser. Shown collapsed, so most people never edit them. */
export function detectRegionalDefaults(
  language: string | undefined = typeof navigator === 'undefined' ? undefined : navigator.language,
  zone: string | undefined = Intl.DateTimeFormat().resolvedOptions().timeZone,
): RegionalDefaults {
  const locale = matchLocale(language);
  const region = locale.split('-')[1] ?? 'US';
  const guess = REGION_CURRENCY[region] ?? FALLBACK.currency;
  const currency = (SUPPORTED_CURRENCIES as readonly string[]).includes(guess)
    ? guess
    : FALLBACK.currency;
  return { currency, locale, timezone: isSupportedTimeZone(zone) ? zone : FALLBACK.timezone };
}

/** "United States - USD - en-US - America/New_York" for the collapsed summary. */
export function describeRegional(defaults: RegionalDefaults): string {
  let region = defaults.locale;
  try {
    const code = defaults.locale.split('-')[1];
    if (code) region = new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? region;
  } catch {
    // Fall back to the tag.
  }
  return `${region} · ${defaults.currency} · ${defaults.locale} · ${defaults.timezone}`;
}

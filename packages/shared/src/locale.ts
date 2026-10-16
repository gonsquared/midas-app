import { z } from 'zod';

/** ISO 4217 codes the product supports for wallets and preferences. */
export const SUPPORTED_CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'CHF',
  'CAD',
  'AUD',
  'NZD',
  'SEK',
  'NOK',
  'DKK',
  'PLN',
  'CZK',
  'HUF',
  'RON',
  'BGN',
  'ISK',
  'TRY',
  'ILS',
  'AED',
  'SAR',
  'ZAR',
  'INR',
  'CNY',
  'HKD',
  'SGD',
  'KRW',
  'THB',
  'IDR',
  'MYR',
  'PHP',
  'VND',
  'TWD',
  'BRL',
  'MXN',
  'ARS',
  'CLP',
  'COP',
  'PEN',
] as const;

export const SUPPORTED_LOCALES = [
  'en-US',
  'en-GB',
  'en-AU',
  'en-CA',
  'en-IN',
  'de-DE',
  'de-AT',
  'de-CH',
  'fr-FR',
  'fr-CA',
  'es-ES',
  'es-MX',
  'pt-BR',
  'pt-PT',
  'it-IT',
  'nl-NL',
  'sv-SE',
  'nb-NO',
  'da-DK',
  'fi-FI',
  'pl-PL',
  'cs-CZ',
  'tr-TR',
  'ja-JP',
  'ko-KR',
  'zh-CN',
  'zh-TW',
  'hi-IN',
  'id-ID',
] as const;

export const CurrencyCodeSchema = z.enum(SUPPORTED_CURRENCIES);
export type CurrencyCode = z.infer<typeof CurrencyCodeSchema>;

export const LocaleSchema = z.enum(SUPPORTED_LOCALES);
export type Locale = z.infer<typeof LocaleSchema>;

const ZONES: ReadonlySet<string> = new Set([...Intl.supportedValuesOf('timeZone'), 'UTC']);

/** IANA time zone name known to the runtime's ICU data (plus UTC). */
export const TimeZoneSchema = z
  .string()
  .max(64)
  .refine((value) => ZONES.has(value), { message: 'Unknown time zone' });
export type TimeZone = z.infer<typeof TimeZoneSchema>;

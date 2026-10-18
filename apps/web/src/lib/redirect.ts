/**
 * Post-sign-in return path (ui-design 15.4). Only same-origin app paths on a known route prefix
 * are honoured; everything else lands on the dashboard. The check lives here, in one place.
 */
export const DEFAULT_RETURN_PATH = '/dashboard';

const KNOWN_PREFIXES = [
  '/dashboard',
  '/transactions',
  '/wallets',
  '/categories',
  '/budgets',
  '/recurring',
  '/reports',
  '/settings',
  '/admin',
] as const;

const MAX_LENGTH = 2048;
// Control characters, whitespace and backslashes are never part of a legitimate app path.
const FORBIDDEN = /[\p{Cc}\s\x5c]/u;

const PROBE_ORIGIN = 'http://midas.invalid';

function hasKnownPrefix(pathname: string): boolean {
  return KNOWN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** Returns a safe in-app path (with search, without fragment), or the dashboard. */
export function safeReturnPath(value: unknown): string {
  if (typeof value !== 'string' || value === '' || value.length > MAX_LENGTH) {
    return DEFAULT_RETURN_PATH;
  }
  if (!value.startsWith('/') || value.startsWith('//') || FORBIDDEN.test(value)) {
    return DEFAULT_RETURN_PATH;
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return DEFAULT_RETURN_PATH;
  }
  // An encoded slash or backslash could be re-read as a protocol-relative URL downstream.
  if (decoded.startsWith('//') || FORBIDDEN.test(decoded.split('?')[0] ?? '')) {
    return DEFAULT_RETURN_PATH;
  }
  let url: URL;
  try {
    url = new URL(value, PROBE_ORIGIN);
  } catch {
    return DEFAULT_RETURN_PATH;
  }
  if (url.origin !== PROBE_ORIGIN) return DEFAULT_RETURN_PATH;
  // Normalised pathname must not have climbed out of the requested route (no "..").
  if (url.pathname.split('/').includes('..') || !hasKnownPrefix(url.pathname)) {
    return DEFAULT_RETURN_PATH;
  }
  return `${url.pathname}${url.search}`;
}

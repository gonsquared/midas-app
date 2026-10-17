/*
 * URL search (de)serialisation. The router default JSON-encodes values, which turns "?q=123" into a
 * number and arrays into ["a","b"]. Midas URLs are meant to be readable and linkable, so arrays
 * are repeated keys (?wallet=a&wallet=b) and every value is a plain string; each route validates
 * and converts what it reads.
 */
export type RawSearch = Record<string, string | string[]>;

export function parseSearch(search: string): RawSearch {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const result: RawSearch = {};
  for (const key of new Set(params.keys())) {
    // Prototype pollution guard: these keys are never meaningful search parameters.
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    const values = params.getAll(key);
    result[key] = values.length === 1 ? (values[0] as string) : values;
  }
  return result;
}

export function stringifySearch(search: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, String(item));
    } else if (typeof value === 'object') {
      params.append(key, JSON.stringify(value));
    } else {
      params.append(key, String(value));
    }
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

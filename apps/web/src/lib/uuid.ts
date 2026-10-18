const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** True for a canonical UUID. Use before putting a URL-supplied id into an API path. */
export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID.test(value);

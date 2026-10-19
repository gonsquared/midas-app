import { isPgError } from './db/errors.js';

/**
 * Log serializer for the `err` key. node-postgres errors carry `detail` (which contains row
 * values, for example a password hash on a unique violation), `where` and `internalQuery`;
 * only a fixed allowlist of fields is ever logged for them. Other errors log type, message
 * and stack.
 */
export interface SerializedError {
  [key: string]: unknown;
  type: string;
  message: string;
  stack: string;
}

export function serializeError(error: unknown): SerializedError {
  if (isPgError(error)) {
    const e = error as unknown as Record<string, unknown>;
    const out: SerializedError = { type: 'DatabaseError', message: '', stack: '' };
    // SQLSTATE class 22 (data exception) messages quote the offending input value.
    const dataException = typeof e.code === 'string' && e.code.startsWith('22');
    for (const key of ['code', 'constraint', 'table', 'column', 'routine', 'message']) {
      if (key === 'message' && dataException) continue;
      if (typeof e[key] === 'string') out[key] = e[key];
    }
    return out;
  }
  if (error instanceof Error) {
    return { type: error.name, message: error.message, stack: error.stack ?? '' };
  }
  return { type: 'NonError', message: String(error), stack: '' };
}

/**
 * Keeps the path and the parameter names of a request URL but drops every query value, because
 * search terms (`q`), tokens and other values can be personal or secret.
 */
export function redactUrl(url: string): string {
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return url;
  const names = url
    .slice(queryStart + 1)
    .split('&')
    .filter((pair) => pair !== '')
    .map((pair) => `${pair.split('=')[0] ?? ''}=[redacted]`);
  return names.length > 0
    ? `${url.slice(0, queryStart)}?${names.join('&')}`
    : url.slice(0, queryStart);
}

/** Request serializer for the `req` key (same fields as Fastify's default, with a redacted URL). */
export function serializeRequest(request: {
  method?: string;
  url?: string;
  host?: string;
  ip?: string;
  socket?: { remotePort?: number | undefined };
}): Record<string, unknown> {
  return {
    method: request.method,
    url: request.url === undefined ? undefined : redactUrl(request.url),
    host: request.host,
    remoteAddress: request.ip,
    remotePort: request.socket?.remotePort,
  };
}

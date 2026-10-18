import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from './errors.js';

/** Applies a limit to the request. `keyPart` replaces the default key (for example a hashed email). */
export type Limiter = (
  request: FastifyRequest,
  reply: FastifyReply,
  keyPart?: string,
) => Promise<void>;

export interface LimiterOptions {
  /** Namespace so limiters never share a counter. */
  name: string;
  max: number;
  windowSeconds: number;
  /** Default counter key within the namespace. Must not contain raw secrets. */
  key: (request: FastifyRequest) => string;
  /**
   * Capacity of this limiter's own in-memory store. Every limiter has a private store, so a flood
   * of keys against one endpoint cannot evict the counters of another.
   */
  maxKeys?: number;
}

/** Default per-limiter store capacity (LRU). Config overrides it through RATE_LIMIT_STORE_MAX_KEYS. */
export const DEFAULT_RATE_LIMIT_MAX_KEYS = 25_000;

function hextets(address: string): number[] | null {
  let text = address;
  const lastColon = text.lastIndexOf(':');
  if (text.includes('.')) {
    // Embedded IPv4 tail (::ffff:203.0.113.9): turn it into two hextets.
    const parts = text
      .slice(lastColon + 1)
      .split('.')
      .map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
      return null;
    }
    const [a = 0, b = 0, c = 0, d = 0] = parts;
    text = `${text.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  const values = groups.map((g) => Number.parseInt(g, 16));
  return values.length === 8 && values.every((v) => Number.isInteger(v) && v >= 0 && v <= 0xffff)
    ? values
    : null;
}

/**
 * Counter key for a client address. IPv4 stays as is; IPv6 is reduced to its /64 network, because
 * a single subscriber normally owns a whole /64 and could otherwise rotate through 2^64 addresses
 * to dodge a limit or flood the store. IPv4-mapped IPv6 addresses count as the IPv4 address.
 * Use this helper in every IP-based rate-limit key.
 */
export function ipKey(ip: string): string {
  const address = ip.split('%')[0] ?? ip; // drop an IPv6 zone id
  if (isIP(address) === 4) return address;
  if (isIP(address) !== 6) return ip;
  const groups = hextets(address);
  if (!groups) return ip;
  const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0, g6 = 0, g7 = 0] = groups;
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) {
    return `${g6 >> 8}.${g6 & 255}.${g7 >> 8}.${g7 & 255}`;
  }
  return `${[g0, g1, g2, g3].map((g) => g.toString(16)).join(':')}::/64`;
}

/** Stable, non-reversible key part for values such as email addresses (never store them raw). */
export function hashKey(value: string): string {
  return createHash('sha256').update(value).digest('base64url').slice(0, 22);
}

/**
 * Builds a limiter on top of the store of `@fastify/rate-limit`. Several limiters can guard one
 * request (the route hook of the plugin only runs the first one), and each sends the standard
 * `RateLimit-*` headers and throws `429 RATE_LIMITED` with `Retry-After`.
 */
export function createLimiter(app: FastifyInstance, options: LimiterOptions): Limiter {
  const overrides = new WeakMap<object, string>();
  // `cache` sizes the private LRU store of this limiter (read by the plugin's `store.child`), but
  // it is missing from the plugin's `createRateLimit` typings, hence the separate object.
  const storeSize = { cache: options.maxKeys ?? DEFAULT_RATE_LIMIT_MAX_KEYS };
  const apply = app.createRateLimit({
    max: options.max,
    timeWindow: options.windowSeconds * 1000,
    ...storeSize,
    keyGenerator: (request) =>
      `${options.name}:${overrides.get(request) ?? options.key(request as FastifyRequest)}`,
  });

  return async (request, reply, keyPart) => {
    if (keyPart !== undefined) overrides.set(request, keyPart);
    const result = await apply(request);
    if (result.isAllowed) return;
    const resetSeconds = Math.max(1, result.ttlInSeconds);
    reply.header('RateLimit-Limit', String(result.max));
    reply.header('RateLimit-Remaining', String(result.remaining));
    reply.header('RateLimit-Reset', String(resetSeconds));
    if (result.isExceeded) {
      throw new AppError('RATE_LIMITED', 'Too many requests. Try again later.', {
        retryAfterSeconds: resetSeconds,
      });
    }
  };
}

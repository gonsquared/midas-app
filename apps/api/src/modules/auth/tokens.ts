import { createHash, randomBytes } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';

export const ACCESS_TOKEN_ISSUER = 'midas-api';
export const ACCESS_TOKEN_AUDIENCE = 'midas-web';

export interface RefreshToken {
  /** Sent to the client in the cookie. Never stored or logged. */
  token: string;
  /** SHA-256 digest (32 bytes) stored in `sessions`. */
  hash: Buffer;
}

export function hashRefreshToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

/** `<session uuid>.<43 base64url chars>` (32 random bytes). */
const REFRESH_TOKEN_PATTERN =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.[A-Za-z0-9_-]{43}$/;

/**
 * `<sid>.<32 random bytes, base64url>` (architecture 9). The session id is not secret and not
 * trusted: it only tells the server which session to revoke when an unknown token is replayed.
 */
export function generateRefreshToken(sessionId: string): RefreshToken {
  const token = `${sessionId}.${randomBytes(32).toString('base64url')}`;
  return { token, hash: hashRefreshToken(token) };
}

/** Returns the session id of a well-formed token, or null. Pure: no database access. */
export function parseRefreshToken(token: string): { sessionId: string } | null {
  const match = REFRESH_TOKEN_PATTERN.exec(token);
  return match?.[1] ? { sessionId: match[1] } : null;
}

export interface IssuedAccessToken {
  token: string;
  expiresAt: Date;
}

export interface AccessTokenClaims {
  userId: string;
  sessionId: string;
}

export interface AccessTokenService {
  issue(claims: AccessTokenClaims, now: Date): Promise<IssuedAccessToken>;
  verify(token: string, now: Date): Promise<AccessTokenClaims>;
}

/** HS256 JWT via jose; only HS256 is accepted on verify, so `alg: none` is rejected. */
export function createAccessTokenService(options: {
  secret: string;
  ttlSeconds: number;
}): AccessTokenService {
  const key = new TextEncoder().encode(options.secret);
  return {
    async issue({ userId, sessionId }, now) {
      const iat = Math.floor(now.getTime() / 1000);
      const exp = iat + options.ttlSeconds;
      const token = await new SignJWT({ sid: sessionId })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject(userId)
        .setIssuer(ACCESS_TOKEN_ISSUER)
        .setAudience(ACCESS_TOKEN_AUDIENCE)
        .setIssuedAt(iat)
        .setExpirationTime(exp)
        .sign(key);
      return { token, expiresAt: new Date(exp * 1000) };
    },
    async verify(token, now) {
      const { payload } = await jwtVerify(token, key, {
        algorithms: ['HS256'],
        issuer: ACCESS_TOKEN_ISSUER,
        audience: ACCESS_TOKEN_AUDIENCE,
        currentDate: now,
        requiredClaims: ['sub', 'sid', 'exp', 'iat'],
      });
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
        throw new Error('Malformed access token claims');
      }
      return { userId: payload.sub, sessionId: payload.sid };
    },
  };
}

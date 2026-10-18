import { createHash } from 'node:crypto';
import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import {
  ACCESS_TOKEN_AUDIENCE,
  ACCESS_TOKEN_ISSUER,
  createAccessTokenService,
  generateRefreshToken,
  hashRefreshToken,
  parseRefreshToken,
} from './tokens.js';

const secret = 'unit-test-secret-with-at-least-32-chars';
const now = new Date('2026-10-16T08:30:00.000Z');
const claims = {
  userId: '0199c6a8-0000-7000-8000-000000000001',
  sessionId: '0199c6a8-0000-7000-8000-000000000002',
};

describe('refresh tokens', () => {
  const sid = claims.sessionId;

  it('is <sid>.<32 random bytes base64url> with a matching SHA-256 digest', () => {
    const a = generateRefreshToken(sid);
    const b = generateRefreshToken(sid);
    expect(a.token.startsWith(`${sid}.`)).toBe(true);
    expect(a.token.split('.')[1]).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.token).not.toBe(b.token);
    expect(a.hash).toHaveLength(32);
    expect(a.hash.equals(createHash('sha256').update(a.token).digest())).toBe(true);
    expect(hashRefreshToken(a.token).equals(a.hash)).toBe(true);
  });

  it('parses the session id back and rejects anything malformed', () => {
    expect(parseRefreshToken(generateRefreshToken(sid).token)).toEqual({ sessionId: sid });
    for (const bad of [
      '',
      'A'.repeat(43),
      `${sid}.`,
      `${sid}.${'A'.repeat(42)}`,
      `x.${'A'.repeat(43)}`,
    ]) {
      expect(parseRefreshToken(bad)).toBeNull();
    }
  });
});

describe('access tokens', () => {
  const service = createAccessTokenService({ secret, ttlSeconds: 600 });

  it('issues a verifiable HS256 token with sub, sid, iss, aud and a 10 minute expiry', async () => {
    const issued = await service.issue(claims, now);
    expect(issued.expiresAt.toISOString()).toBe('2026-10-16T08:40:00.000Z');
    const [header, payload] = issued.token
      .split('.')
      .slice(0, 2)
      .map((part) => JSON.parse(Buffer.from(part as string, 'base64url').toString()));
    expect(header).toMatchObject({ alg: 'HS256' });
    expect(payload).toMatchObject({
      sub: claims.userId,
      sid: claims.sessionId,
      iss: ACCESS_TOKEN_ISSUER,
      aud: ACCESS_TOKEN_AUDIENCE,
    });
    await expect(service.verify(issued.token, now)).resolves.toEqual(claims);
  });

  it('rejects an expired token', async () => {
    const issued = await service.issue(claims, now);
    const later = new Date(now.getTime() + 601_000);
    await expect(service.verify(issued.token, later)).rejects.toThrow();
  });

  it('rejects a token signed with another secret', async () => {
    const other = createAccessTokenService({
      secret: 'a-different-secret-of-sufficient-length',
      ttlSeconds: 600,
    });
    const issued = await other.issue(claims, now);
    await expect(service.verify(issued.token, now)).rejects.toThrow();
  });

  it('rejects alg none', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: claims.userId,
        sid: claims.sessionId,
        iss: ACCESS_TOKEN_ISSUER,
        aud: ACCESS_TOKEN_AUDIENCE,
        iat: Math.floor(now.getTime() / 1000),
        exp: Math.floor(now.getTime() / 1000) + 600,
      }),
    ).toString('base64url');
    await expect(service.verify(`${header}.${payload}.`, now)).rejects.toThrow();
  });

  it('rejects the wrong audience, wrong issuer and a different HMAC algorithm', async () => {
    const key = new TextEncoder().encode(secret);
    const iat = Math.floor(now.getTime() / 1000);
    const build = (alg: string, iss: string, aud: string) =>
      new SignJWT({ sid: claims.sessionId })
        .setProtectedHeader({ alg })
        .setSubject(claims.userId)
        .setIssuer(iss)
        .setAudience(aud)
        .setIssuedAt(iat)
        .setExpirationTime(iat + 600)
        .sign(key);
    await expect(
      service.verify(await build('HS256', ACCESS_TOKEN_ISSUER, 'someone-else'), now),
    ).rejects.toThrow();
    await expect(
      service.verify(await build('HS256', 'someone-else', ACCESS_TOKEN_AUDIENCE), now),
    ).rejects.toThrow();
    await expect(
      service.verify(await build('HS512', ACCESS_TOKEN_ISSUER, ACCESS_TOKEN_AUDIENCE), now),
    ).rejects.toThrow();
  });
});

import { ProblemSchema } from '@midas/shared';
import { SignJWT } from 'jose';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { ACCESS_TOKEN_AUDIENCE, ACCESS_TOKEN_ISSUER } from '../../src/modules/auth/tokens.js';
import { createIntegrationContext, registerUser, type IntegrationContext } from '../support/api.js';
import { TEST_SECRET } from '../support/app.js';
import { describeDb, truncateAll } from '../support/db.js';

const ID = '0197f8a0-0000-7000-8000-000000000001';
const PROTECTED_ROUTES: Array<[string, string]> = [
  ['GET', '/api/v1/me'],
  ['PATCH', '/api/v1/me'],
  ['POST', '/api/v1/me/password'],
  ['GET', '/api/v1/wallets'],
  ['POST', '/api/v1/wallets'],
  ['GET', `/api/v1/wallets/${ID}`],
  ['PATCH', `/api/v1/wallets/${ID}`],
  ['POST', `/api/v1/wallets/${ID}/archive`],
  ['POST', `/api/v1/wallets/${ID}/unarchive`],
  ['DELETE', `/api/v1/wallets/${ID}`],
  ['GET', '/api/v1/categories'],
  ['POST', '/api/v1/categories'],
  ['PATCH', `/api/v1/categories/${ID}`],
  ['DELETE', `/api/v1/categories/${ID}`],
  ['GET', '/api/v1/transactions'],
  ['POST', '/api/v1/transactions'],
  ['GET', `/api/v1/transactions/${ID}`],
  ['PATCH', `/api/v1/transactions/${ID}`],
  ['DELETE', `/api/v1/transactions/${ID}`],
  ['POST', '/api/v1/transfers'],
  ['GET', `/api/v1/transfers/${ID}`],
  ['PATCH', `/api/v1/transfers/${ID}`],
  ['DELETE', `/api/v1/transfers/${ID}`],
];

function b64(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

describeDb('authentication guard (real PostgreSQL)', () => {
  let ctx: IntegrationContext;
  const key = new TextEncoder().encode(TEST_SECRET);

  beforeAll(async () => {
    ctx = await createIntegrationContext();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    ctx.clock.set(new Date());
    await truncateAll(ctx.owner);
  });

  const call = (token: string | null) =>
    ctx.app.inject({
      method: 'GET',
      url: '/api/v1/wallets',
      headers: token === null ? {} : { authorization: `Bearer ${token}` },
    });

  async function forge(overrides: {
    sub: string;
    sid: string;
    alg?: string;
    iss?: string;
    aud?: string;
    exp?: number;
    secret?: Uint8Array;
  }) {
    const now = Math.floor(ctx.clock.now().getTime() / 1000);
    return new SignJWT({ sid: overrides.sid })
      .setProtectedHeader({ alg: overrides.alg ?? 'HS256' })
      .setSubject(overrides.sub)
      .setIssuer(overrides.iss ?? ACCESS_TOKEN_ISSUER)
      .setAudience(overrides.aud ?? ACCESS_TOKEN_AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(overrides.exp ?? now + 600)
      .sign(overrides.secret ?? key);
  }

  async function sessionOf(userId: string): Promise<string> {
    const row = await ctx.owner.query('select id from sessions where user_id = $1', [userId]);
    return row.rows[0].id as string;
  }

  it.each(PROTECTED_ROUTES)('%s %s answers 401 without credentials', async (method, url) => {
    const res = await ctx.app.inject({ method: method as 'GET', url });
    expect(res.statusCode).toBe(401);
    expect(ProblemSchema.parse(res.json()).code).toBe('UNAUTHENTICATED');
    expect(res.headers['www-authenticate']).toBe('Bearer');
  });

  it('accepts a genuine token and a token built the same way with the real secret', async () => {
    const user = await registerUser(ctx.app);
    expect((await call(user.accessToken)).statusCode).toBe(200);
    const sid = await sessionOf(user.id);
    expect((await call(await forge({ sub: user.id, sid }))).statusCode).toBe(200);
  });

  it('rejects alg none, a foreign key, another algorithm, wrong issuer or audience', async () => {
    const user = await registerUser(ctx.app);
    const sid = await sessionOf(user.id);
    const now = Math.floor(ctx.clock.now().getTime() / 1000);
    const claims = {
      sub: user.id,
      sid,
      iss: ACCESS_TOKEN_ISSUER,
      aud: ACCESS_TOKEN_AUDIENCE,
      iat: now,
      exp: now + 600,
    };
    const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64(claims)}.`;
    const foreignKey = new TextEncoder().encode('another-secret-with-at-least-32-characters');
    const tokens = [
      none,
      await forge({ sub: user.id, sid, secret: foreignKey }),
      await forge({ sub: user.id, sid, alg: 'HS512' }),
      await forge({ sub: user.id, sid, iss: 'someone-else' }),
      await forge({ sub: user.id, sid, aud: 'another-audience' }),
      await forge({ sub: user.id, sid, exp: now - 1 }),
      `${user.accessToken}x`,
      user.accessToken.split('.').slice(0, 2).join('.'),
      'not.a.jwt',
    ];
    for (const token of tokens) {
      expect((await call(token)).statusCode).toBe(401);
    }
  });

  it('rejects a token whose subject does not own the session', async () => {
    const alice = await registerUser(ctx.app);
    const bob = await registerUser(ctx.app);
    const bobSession = await sessionOf(bob.id);
    const token = await forge({ sub: alice.id, sid: bobSession });
    expect((await call(token)).statusCode).toBe(401);
  });

  it('rejects an expired access token', async () => {
    const user = await registerUser(ctx.app);
    ctx.clock.advance(10 * 60_000 + 1_000);
    expect((await call(user.accessToken)).statusCode).toBe(401);
  });

  it('ignores credentials in the query string or other schemes', async () => {
    const user = await registerUser(ctx.app);
    const query = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/wallets?access_token=${user.accessToken}`,
    });
    expect(query.statusCode).toBe(401);
    const basic = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/wallets',
      headers: { authorization: `Basic ${user.accessToken}` },
    });
    expect(basic.statusCode).toBe(401);
  });

  it('takes effect immediately when the user is suspended or the session revoked', async () => {
    const user = await registerUser(ctx.app);
    expect((await call(user.accessToken)).statusCode).toBe(200);
    await ctx.owner.query(
      `update users set status = 'suspended', suspended_at = now() where id = $1`,
      [user.id],
    );
    expect((await call(user.accessToken)).statusCode).toBe(401);
    await ctx.owner.query(`update users set status = 'active', suspended_at = null where id = $1`, [
      user.id,
    ]);
    expect((await call(user.accessToken)).statusCode).toBe(200);
    await ctx.owner.query(`update sessions set revoked_at = now(), revoked_reason = 'logout'`);
    expect((await call(user.accessToken)).statusCode).toBe(401);
  });

  it('sets security headers and no-store on API responses, and no CORS headers', async () => {
    const user = await registerUser(ctx.app);
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/wallets',
      headers: { ...user.headers, origin: 'https://evil.example.com' },
    });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

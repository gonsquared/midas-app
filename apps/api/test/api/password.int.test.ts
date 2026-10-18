import { createHash } from 'node:crypto';
import { ProblemSchema } from '@midas/shared';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import {
  createIntegrationContext,
  registerUser,
  STRONG_PASSWORD,
  type IntegrationContext,
} from '../support/api.js';
import { describeDb, truncateAll } from '../support/db.js';

const NEW_PASSWORD = 'a completely different passphrase 77';

describeDb('password reset and change (real PostgreSQL)', () => {
  let ctx: IntegrationContext;

  beforeAll(async () => {
    ctx = await createIntegrationContext();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    ctx.clock.set(new Date());
    ctx.mailer.sent.length = 0;
    await truncateAll(ctx.owner);
  });

  const forgot = (email: string) =>
    ctx.app.inject({ method: 'POST', url: '/api/v1/auth/password/forgot', payload: { email } });
  const verify = (token: string) =>
    ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/password/reset/verify',
      payload: { token },
    });
  const reset = (token: string, newPassword: string) =>
    ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/password/reset',
      payload: { token, newPassword },
    });
  const login = (email: string, password: string) =>
    ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } });

  async function requestToken(email: string): Promise<string> {
    await forgot(email);
    await ctx.background.drain();
    const mail = ctx.mailer.sent.at(-1);
    const match = /reset-password#token=([\w-]+)/.exec(mail?.text ?? '');
    if (!match?.[1]) throw new Error('no reset mail');
    return match[1];
  }

  it('answers identically for known and unknown emails and only mails the known one', async () => {
    const user = await registerUser(ctx.app);
    const known = await forgot(user.email);
    const unknown = await forgot('ghost@example.com');
    await ctx.background.drain();
    expect(known.statusCode).toBe(202);
    expect(unknown.statusCode).toBe(202);
    expect(known.json()).toEqual({ status: 'accepted' });
    expect(unknown.json()).toEqual(known.json());
    expect(ctx.mailer.sent).toHaveLength(1);
    expect(ctx.mailer.sent[0]?.to).toBe(user.email);
  });

  it('rejects only a malformed email or unknown fields on forgot', async () => {
    expect((await forgot('not-an-email')).statusCode).toBe(400);
    const unknownField = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/password/forgot',
      payload: { email: 'a@example.com', userId: 'x' },
    });
    expect(unknownField.statusCode).toBe(400);
  });

  it('stores the token hashed, expiring in 30 minutes, with the token only in the email', async () => {
    const user = await registerUser(ctx.app);
    const token = await requestToken(user.email);
    const rows = await ctx.owner.query(
      'select token_hash, expires_at, used_at from password_reset_tokens',
    );
    expect(rows.rows).toHaveLength(1);
    const row = rows.rows[0];
    expect((row.token_hash as Buffer).toString('hex')).toBe(
      createHash('sha256').update(token).digest('hex'),
    );
    expect(row.used_at).toBeNull();
    const minutes = (row.expires_at.getTime() - ctx.clock.now().getTime()) / 60_000;
    expect(minutes).toBeGreaterThan(29);
    expect(minutes).toBeLessThanOrEqual(30);
    expect(ctx.mailer.sent[0]?.text).toContain(`#token=${token}`);
  });

  it('verifies without consuming, then resets once; a second use fails', async () => {
    const user = await registerUser(ctx.app);
    const token = await requestToken(user.email);
    expect((await verify(token)).statusCode).toBe(204);
    expect((await verify(token)).statusCode).toBe(204);
    expect((await reset(token, NEW_PASSWORD)).statusCode).toBe(204);
    const again = await reset(token, 'yet another passphrase 123 456');
    expect(again.statusCode).toBe(400);
    expect(ProblemSchema.parse(again.json()).code).toBe('RESET_TOKEN_INVALID');
    expect((await verify(token)).statusCode).toBe(400);
  });

  it('revokes every session and replaces the password', async () => {
    const user = await registerUser(ctx.app);
    const token = await requestToken(user.email);
    await reset(token, NEW_PASSWORD);
    const me = await ctx.app.inject({ method: 'GET', url: '/api/v1/me', headers: user.headers });
    expect(me.statusCode).toBe(401);
    expect((await login(user.email, STRONG_PASSWORD)).statusCode).toBe(401);
    expect((await login(user.email, NEW_PASSWORD)).statusCode).toBe(200);
    const sessions = await ctx.owner.query(
      `select revoked_reason from sessions where user_id = $1 and revoked_at is not null`,
      [user.id],
    );
    expect(sessions.rows[0].revoked_reason).toBe('password_reset');
  });

  it('rejects expired, unknown and malformed tokens with the same error', async () => {
    const user = await registerUser(ctx.app);
    const token = await requestToken(user.email);
    ctx.clock.advance(31 * 60_000);
    for (const candidate of [token, 'A'.repeat(43), 'x']) {
      const res = await verify(candidate);
      expect(res.statusCode).toBe(400);
      expect(ProblemSchema.parse(res.json()).code).toBe('RESET_TOKEN_INVALID');
    }
    const expired = await reset(token, NEW_PASSWORD);
    expect(expired.statusCode).toBe(400);
    expect(ProblemSchema.parse(expired.json()).code).toBe('RESET_TOKEN_INVALID');
  });

  it('keeps the token usable after a weak password', async () => {
    const user = await registerUser(ctx.app);
    const token = await requestToken(user.email);
    const weak = await reset(token, 'password1234');
    expect(weak.statusCode).toBe(400);
    const problem = ProblemSchema.parse(weak.json());
    expect(problem.code).toBe('VALIDATION_FAILED');
    expect(problem.errors?.[0]).toMatchObject({ field: 'newPassword', code: 'WEAK_PASSWORD' });
    expect((await reset(token, NEW_PASSWORD)).statusCode).toBe(204);
  });

  it('a new request invalidates the earlier link', async () => {
    const user = await registerUser(ctx.app);
    const first = await requestToken(user.email);
    const second = await requestToken(user.email);
    expect(second).not.toBe(first);
    expect((await verify(first)).statusCode).toBe(400);
    expect((await verify(second)).statusCode).toBe(204);
  });

  it('does not fail the request when mail delivery fails', async () => {
    const user = await registerUser(ctx.app);
    ctx.mailer.failNext = new Error('smtp down');
    const res = await forgot(user.email);
    await ctx.background.drain();
    expect(res.statusCode).toBe(202);
  });

  it('rate limits per email hash uniformly for known and unknown emails', async () => {
    const limited = await createIntegrationContext({
      RATE_LIMIT_ENABLED: 'true',
      RATE_LIMIT_FORGOT_EMAIL_MAX: '3',
      RATE_LIMIT_FORGOT_IP_MAX: '50',
    });
    try {
      const send = (email: string) =>
        limited.app.inject({
          method: 'POST',
          url: '/api/v1/auth/password/forgot',
          payload: { email },
        });
      const codes = [];
      for (let i = 0; i < 4; i++) codes.push((await send('same@example.com')).statusCode);
      expect(codes).toEqual([202, 202, 202, 429]);
      const blocked = await send('same@example.com');
      expect(blocked.headers['retry-after']).toBeDefined();
      expect(ProblemSchema.parse(blocked.json()).code).toBe('RATE_LIMITED');
      expect((await send('other@example.com')).statusCode).toBe(202);
    } finally {
      await limited.close();
    }
  });
});

import { ProblemSchema, UserSchema } from '@midas/shared';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import {
  createIntegrationContext,
  refreshHeaders,
  registerUser,
  STRONG_PASSWORD,
  type IntegrationContext,
} from '../support/api.js';
import { describeDb, truncateAll } from '../support/db.js';

const NEW_PASSWORD = 'a completely different passphrase 77';

describeDb('profile, settings and password change (real PostgreSQL)', () => {
  let ctx: IntegrationContext;

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

  const patchMe = (headers: Record<string, string>, payload: unknown) =>
    ctx.app.inject({ method: 'PATCH', url: '/api/v1/me', headers, payload: payload as object });
  const changePassword = (headers: Record<string, string>, payload: unknown) =>
    ctx.app.inject({
      method: 'POST',
      url: '/api/v1/me/password',
      headers,
      payload: payload as object,
    });
  const loginAs = (email: string, password: string) =>
    ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } });

  it('GET /me returns the profile and never the password hash', async () => {
    const user = await registerUser(ctx.app, { currency: 'GBP', displayName: 'Ada' });
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/me', headers: user.headers });
    expect(res.statusCode).toBe(200);
    const body = UserSchema.parse(res.json());
    expect(body).toMatchObject({ id: user.id, displayName: 'Ada', role: 'user', status: 'active' });
    expect(body.preferences.currency).toBe('GBP');
    expect(res.body).not.toMatch(/password|hash/i);
  });

  it('PATCH /me updates the allowed fields and persists them, returned again on login', async () => {
    const user = await registerUser(ctx.app);
    const res = await patchMe(user.headers, {
      displayName: '  New Name ',
      preferences: { currency: 'JPY', locale: 'ja-JP', timezone: 'Asia/Tokyo', theme: 'dark' },
    });
    expect(res.statusCode).toBe(200);
    expect(UserSchema.parse(res.json())).toMatchObject({
      displayName: 'New Name',
      preferences: { currency: 'JPY', locale: 'ja-JP', timezone: 'Asia/Tokyo', theme: 'dark' },
    });
    const login = await loginAs(user.email, STRONG_PASSWORD);
    expect(login.json().user.preferences).toEqual({
      currency: 'JPY',
      locale: 'ja-JP',
      timezone: 'Asia/Tokyo',
      theme: 'dark',
    });
  });

  it('PATCH /me supports partial updates and an empty body', async () => {
    const user = await registerUser(ctx.app);
    const partial = await patchMe(user.headers, { preferences: { theme: 'light' } });
    expect(partial.json().preferences).toMatchObject({ theme: 'light', currency: 'USD' });
    expect((await patchMe(user.headers, {})).statusCode).toBe(200);
  });

  it.each([
    ['unsupported currency', { preferences: { currency: 'XXX' } }],
    ['lowercase currency', { preferences: { currency: 'usd' } }],
    ['unsupported locale', { preferences: { locale: 'xx-YY' } }],
    ['unknown time zone', { preferences: { timezone: 'Mars/Olympus' } }],
    ['unknown theme', { preferences: { theme: 'neon' } }],
    ['blank display name', { displayName: '   ' }],
    ['long display name', { displayName: 'x'.repeat(81) }],
    ['control characters in name', { displayName: 'bad\u0000name' }],
    ['email change', { email: 'new@example.com' }],
    ['role escalation', { role: 'admin' }],
    ['status change', { status: 'suspended' }],
    ['unknown preference', { preferences: { admin: true } }],
    ['wrong type', { displayName: 42 }],
  ])('PATCH /me rejects %s with 400', async (_name, payload) => {
    const user = await registerUser(ctx.app);
    const res = await patchMe(user.headers, payload);
    expect(res.statusCode).toBe(400);
    expect(ProblemSchema.parse(res.json()).code).toBe('VALIDATION_FAILED');
    const after = await ctx.owner.query('select role, status, email from users where id = $1', [
      user.id,
    ]);
    expect(after.rows[0]).toMatchObject({ role: 'user', status: 'active', email: user.email });
  });

  it('password change requires the current password', async () => {
    const user = await registerUser(ctx.app);
    const wrong = await changePassword(user.headers, {
      currentPassword: 'definitely not it 12345',
      newPassword: NEW_PASSWORD,
    });
    expect(wrong.statusCode).toBe(400);
    expect(ProblemSchema.parse(wrong.json()).code).toBe('INVALID_CURRENT_PASSWORD');
    expect((await loginAs(user.email, STRONG_PASSWORD)).statusCode).toBe(200);
  });

  it('password change rejects the same or a weak password', async () => {
    const user = await registerUser(ctx.app);
    const same = await changePassword(user.headers, {
      currentPassword: STRONG_PASSWORD,
      newPassword: STRONG_PASSWORD,
    });
    expect(same.statusCode).toBe(400);
    expect(ProblemSchema.parse(same.json()).errors?.[0]).toMatchObject({ code: 'SAME_AS_CURRENT' });
    const weak = await changePassword(user.headers, {
      currentPassword: STRONG_PASSWORD,
      newPassword: 'password1234',
    });
    expect(ProblemSchema.parse(weak.json()).errors?.[0]).toMatchObject({ code: 'WEAK_PASSWORD' });
  });

  it('password change succeeds, revokes other sessions and keeps the current one', async () => {
    const user = await registerUser(ctx.app);
    const second = await loginAs(user.email, STRONG_PASSWORD);
    const res = await changePassword(user.headers, {
      currentPassword: STRONG_PASSWORD,
      newPassword: NEW_PASSWORD,
    });
    expect(res.statusCode).toBe(204);
    const other = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${second.json().accessToken}` },
    });
    expect(other.statusCode).toBe(401);
    const current = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: user.headers,
    });
    expect(current.statusCode).toBe(200);
    const refreshed = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: refreshHeaders(user.refreshToken),
    });
    expect(refreshed.statusCode).toBe(200);
    expect((await loginAs(user.email, NEW_PASSWORD)).statusCode).toBe(200);
    expect((await loginAs(user.email, STRONG_PASSWORD)).statusCode).toBe(401);
  });

  it('limits current-password guessing on /me/password', async () => {
    const limited = await createIntegrationContext({
      RATE_LIMIT_ENABLED: 'true',
      RATE_LIMIT_PASSWORD_CHANGE_MAX: '3',
    });
    try {
      const user = await registerUser(limited.app);
      const codes = [];
      for (let i = 0; i < 4; i++) {
        const res = await limited.app.inject({
          method: 'POST',
          url: '/api/v1/me/password',
          headers: user.headers,
          payload: { currentPassword: `wrong guess number ${i}`, newPassword: NEW_PASSWORD },
        });
        codes.push(res.statusCode);
      }
      expect(codes).toEqual([400, 400, 400, 429]);
    } finally {
      await limited.close();
    }
  });
});

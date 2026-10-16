import { RegisterRequestSchema } from '@midas/shared';
import { describe, expect, it } from 'vitest';
import { createFakeAuth, fakeHasher, uniqueViolation } from '../../../test/support/fakes.js';
import { argon2Hasher } from './password-hasher.js';
import { AuthService } from './service.js';
import { createAccessTokenService, hashRefreshToken } from './tokens.js';

const NOW = new Date('2026-10-16T08:30:00.000Z');
const input = RegisterRequestSchema.parse({
  email: 'Jane@Example.com',
  password: 'correct horse battery staple 42',
  displayName: 'Jane',
  currency: 'EUR',
  locale: 'de-DE',
  timezone: 'Europe/Berlin',
});
const context = { ip: '203.0.113.9', userAgent: 'vitest' };

function setup(hasher = fakeHasher) {
  const fake = createFakeAuth();
  const accessTokens = createAccessTokenService({
    secret: 'unit-test-secret-with-at-least-32-chars',
    ttlSeconds: 600,
  });
  const service = new AuthService({
    unitOfWork: fake.unitOfWork,
    hasher,
    accessTokens,
    clock: { now: () => NOW },
    refreshTokenTtlDays: 30,
  });
  return { fake, service, accessTokens };
}

describe('AuthService.register', () => {
  it('creates the user and a session and returns an AuthSession plus the raw refresh token', async () => {
    const { fake, service, accessTokens } = setup();
    const result = await service.register(input, context);

    expect(fake.users).toHaveLength(1);
    expect(fake.sessions).toHaveLength(1);
    expect(result.session.user).toMatchObject({
      email: 'jane@example.com',
      displayName: 'Jane',
      role: 'user',
      status: 'active',
      preferences: { currency: 'EUR', locale: 'de-DE', timezone: 'Europe/Berlin', theme: 'system' },
    });
    expect(result.session.accessTokenExpiresAt).toBe('2026-10-16T08:40:00.000Z');
    const claims = await accessTokens.verify(result.session.accessToken, NOW);
    expect(claims).toEqual({ userId: result.session.user.id, sessionId: fake.sessions[0]?.id });
    expect(result.refreshTokenMaxAgeSeconds).toBe(30 * 86_400);
  });

  it('stores only the SHA-256 of the refresh token, with the expiry and client metadata', async () => {
    const { fake, service } = setup();
    const result = await service.register(input, context);
    const session = fake.sessions[0];
    expect(session?.refreshTokenHash.equals(hashRefreshToken(result.refreshToken))).toBe(true);
    expect(session?.expiresAt.toISOString()).toBe('2026-11-15T08:30:00.000Z');
    expect(session).toMatchObject({ ip: '203.0.113.9', userAgent: 'vitest' });
  });

  it('stores a null ip when the client address is not a valid IP (inet column)', async () => {
    const { fake, service } = setup();
    await service.register(input, { ip: 'not-an-ip', userAgent: 'vitest' });
    await service.register(
      { ...input, email: 'b@example.com' },
      { ip: '2001:db8::1', userAgent: 'v' },
    );
    expect(fake.sessions[0]?.ip).toBeNull();
    expect(fake.sessions[1]?.ip).toBe('2001:db8::1');
  });

  it('never stores or returns the plaintext password', async () => {
    const { fake, service } = setup();
    const result = await service.register(input, context);
    expect(fake.users[0]?.passwordHash).not.toContain(input.password);
    expect(JSON.stringify(result)).not.toContain(input.password);
  });

  it('hashes with argon2id (real hasher)', async () => {
    const { fake, service } = setup(argon2Hasher);
    await service.register(input, context);
    const stored = fake.users[0]?.passwordHash ?? '';
    expect(stored).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await argon2Hasher.verify(stored, input.password)).toBe(true);
    expect(await argon2Hasher.verify(stored, 'wrong password')).toBe(false);
  });

  it('truncates an oversized user agent to the column limit', async () => {
    const { fake, service } = setup();
    await service.register(input, { ip: null, userAgent: 'x'.repeat(2000) });
    expect(fake.sessions[0]?.userAgent).toHaveLength(512);
  });

  it('maps a duplicate email to EMAIL_TAKEN with the email field error', async () => {
    const { service } = setup();
    await service.register(input, context);
    await expect(service.register(input, context)).rejects.toMatchObject({
      code: 'EMAIL_TAKEN',
      status: 409,
      errors: [{ field: 'email', code: 'EMAIL_TAKEN' }],
    });
  });

  it('does not map other unique violations or errors to EMAIL_TAKEN', async () => {
    const { fake, service } = setup();
    fake.failNextSessionInsert(uniqueViolation('uq_sessions__current_hash'));
    await expect(service.register(input, context)).rejects.toMatchObject({ code: '23505' });
    expect(fake.users).toHaveLength(0);
  });

  it('rolls back the user when the session cannot be created', async () => {
    const { fake, service } = setup();
    fake.failNextSessionInsert(new Error('boom'));
    await expect(service.register(input, context)).rejects.toThrow('boom');
    expect(fake.users).toHaveLength(0);
    await expect(service.register(input, context)).resolves.toBeDefined();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { createFakeAuth, fakeHasher, uniqueViolation } from '../../../test/support/fakes.js';
import { BackgroundTasks } from '../../platform/background.js';
import { MemoryMailer } from '../../platform/mailer/mailer.js';
import { PasswordService, RESET_OUTSTANDING_CONSTRAINT } from './password-service.js';
import type { AuthUnitOfWork } from './repository.js';

const NOW = new Date('2026-10-16T08:30:00.000Z');
const CURRENT = 'correct horse battery staple 42';
const NEXT = 'another long unusual passphrase 77';

async function setup() {
  const fake = createFakeAuth();
  const user = await fake.repositories.users.insert({
    id: '0199c6a8-0000-7000-8000-000000000001',
    email: 'jane@example.com',
    passwordHash: await fakeHasher.hash(CURRENT),
    displayName: 'Jane',
    preferences: { currency: 'EUR', locale: 'de-DE', timezone: 'Europe/Berlin' },
  });
  const events: string[] = [];
  const hasher = {
    hash: vi.fn(async (p: string) => {
      events.push('hash');
      return fakeHasher.hash(p);
    }),
    verify: vi.fn(async (h: string, p: string) => {
      events.push('verify');
      return fakeHasher.verify(h, p);
    }),
  };
  const logged: Array<Record<string, unknown>> = [];
  const errors: unknown[] = [];
  const background = new BackgroundTasks((e) => errors.push(e));
  const mailer = new MemoryMailer();
  let unitOfWork: AuthUnitOfWork = async (fn) => {
    events.push('tx-begin');
    try {
      return await fake.unitOfWork(fn);
    } finally {
      events.push('tx-end');
    }
  };
  const service = new PasswordService({
    unitOfWork: (fn) => unitOfWork(fn),
    repositories: fake.repositories,
    hasher,
    clock: { now: () => NOW },
    mailer,
    background,
    appBaseUrl: 'https://midas.example.com',
    logger: { info: (o) => logged.push(o), warn: (o) => logged.push(o) },
  });
  return {
    fake,
    user,
    service,
    events,
    logged,
    errors,
    background,
    mailer,
    setUnitOfWork: (u: AuthUnitOfWork) => {
      unitOfWork = u;
    },
  };
}

describe('PasswordService.changePassword', () => {
  it('does the expensive hashing and checks before opening the transaction', async () => {
    const { service, user, events, fake } = await setup();
    await service.changePassword(
      { userId: user.id, sessionId: 'sid' },
      { currentPassword: CURRENT, newPassword: NEXT },
    );
    expect(events).toEqual(['verify', 'hash', 'tx-begin', 'tx-end']);
    expect(await fakeHasher.verify(fake.users[0]?.passwordHash ?? '', NEXT)).toBe(true);
  });

  it('rejects wrong, identical and weak passwords without opening a transaction', async () => {
    const { service, user, events } = await setup();
    const principal = { userId: user.id, sessionId: 'sid' };
    await expect(
      service.changePassword(principal, {
        currentPassword: 'wrong password 123',
        newPassword: NEXT,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CURRENT_PASSWORD' });
    await expect(
      service.changePassword(principal, { currentPassword: CURRENT, newPassword: CURRENT }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(
      service.changePassword(principal, { currentPassword: CURRENT, newPassword: 'password1234' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(events).not.toContain('tx-begin');
  });

  it('fails when the credential changed while the new hash was being computed', async () => {
    const { service, user, fake, setUnitOfWork } = await setup();
    setUnitOfWork(async (fn) => {
      // A concurrent change commits between the verification and our transaction.
      await fake.repositories.users.updatePassword(
        user.id,
        await fakeHasher.hash('someone else 99'),
      );
      return fake.unitOfWork(fn);
    });
    await expect(
      service.changePassword(
        { userId: user.id, sessionId: 'sid' },
        { currentPassword: CURRENT, newPassword: NEXT },
      ),
    ).rejects.toMatchObject({ code: 'INVALID_CURRENT_PASSWORD' });
    expect(await fakeHasher.verify(fake.users[0]?.passwordHash ?? '', 'someone else 99')).toBe(
      true,
    );
  });

  it('revokes the other sessions but keeps the current one', async () => {
    const { service, user, fake } = await setup();
    for (const id of ['s1', 's2']) {
      await fake.repositories.sessions.insert({
        id,
        userId: user.id,
        refreshTokenHash: Buffer.from(id.padEnd(32, '0')),
        expiresAt: new Date(NOW.getTime() + 1e9),
        userAgent: null,
        ip: null,
      });
    }
    await service.changePassword(
      { userId: user.id, sessionId: 's1' },
      { currentPassword: CURRENT, newPassword: NEXT },
    );
    expect(fake.sessions.map((s) => [s.id, s.revokedReason])).toEqual([
      ['s1', null],
      ['s2', 'password_changed'],
    ]);
  });
});

describe('PasswordService.requestReset', () => {
  it('treats a lost race on the outstanding-token index as benign', async () => {
    const { service, background, errors, logged, mailer, setUnitOfWork } = await setup();
    setUnitOfWork(async () => {
      throw uniqueViolation(RESET_OUTSTANDING_CONSTRAINT);
    });
    service.requestReset('jane@example.com');
    await background.drain();
    expect(errors).toEqual([]);
    expect(mailer.sent).toHaveLength(0);
    expect(logged.map((l) => l.event)).toContain('auth.password_reset_coalesced');
  });

  it('still reports other failures', async () => {
    const { service, background, errors, setUnitOfWork } = await setup();
    setUnitOfWork(async () => {
      throw uniqueViolation('uq_password_reset_tokens__token_hash');
    });
    service.requestReset('jane@example.com');
    await background.drain();
    expect(errors).toHaveLength(1);
  });

  it('sends the link when the token was stored', async () => {
    const { service, background, errors, mailer } = await setup();
    service.requestReset('jane@example.com');
    await background.drain();
    expect(errors).toEqual([]);
    expect(mailer.sent).toHaveLength(1);
  });
});

import { Readable } from 'node:stream';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { readFirstLine, runAdminCreate, runAdminPromote } from '../../src/cli-admin.js';
import { bootstrapAdminFromEnv } from '../../src/modules/admin/bootstrap.js';
import {
  auditRows,
  createIntegrationContext,
  registerUser,
  STRONG_PASSWORD,
  type IntegrationContext,
} from '../support/api.js';
import { describeDb, truncateAll } from '../support/db.js';

describeDb('BOOTSTRAP_ADMIN_EMAIL and the admin CLI helpers (real PostgreSQL, ADR-013)', () => {
  let ctx: IntegrationContext;
  beforeAll(async () => {
    ctx = await createIntegrationContext();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await truncateAll(ctx.owner);
  });
  const deps = () => ({ db: ctx.client.db, clock: ctx.clock });
  const adminCount = async () =>
    (await ctx.owner.query(`select count(*)::int as n from users where role = 'admin'`)).rows[0]
      .n as number;

  it('creates the named account once, only while no admin exists, with an unusable password', async () => {
    expect(await bootstrapAdminFromEnv(deps(), 'boss@example.com')).toBe('created');
    expect(await bootstrapAdminFromEnv(deps(), 'other@example.com')).toBe('admin_exists');
    expect(await bootstrapAdminFromEnv(deps(), 'boss@example.com')).toBe('admin_exists');
    expect(await adminCount()).toBe(1);
    const rows = await auditRows(ctx.owner, ['system.admin_bootstrapped']);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actor_user_id: null, metadata: { via: 'env' } });
    // Nobody knows the password: login fails, the owner must use the password-reset email.
    const login = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'boss@example.com', password: STRONG_PASSWORD },
    });
    expect(login.statusCode).toBe(401);
  });

  it('refuses to promote an existing account matched only by email', async () => {
    const squatter = await registerUser(ctx.app);
    expect(await bootstrapAdminFromEnv(deps(), squatter.email)).toBe('email_taken');
    expect(await adminCount()).toBe(0);
    expect(await auditRows(ctx.owner, ['system.admin_bootstrapped'])).toHaveLength(0);
    const role = (await ctx.owner.query('select role from users where id = $1', [squatter.id]))
      .rows[0].role;
    expect(role).toBe('user');
  });

  it('concurrent boots of several instances create exactly one admin', async () => {
    const outcomes = await Promise.all(
      ['a@example.com', 'b@example.com', 'c@example.com'].map((e) =>
        bootstrapAdminFromEnv(deps(), e),
      ),
    );
    expect(outcomes.filter((o) => o === 'created')).toHaveLength(1);
    expect(outcomes.filter((o) => o === 'admin_exists')).toHaveLength(2);
    expect(await adminCount()).toBe(1);
    expect(await auditRows(ctx.owner, ['system.admin_bootstrapped'])).toHaveLength(1);
  });

  it('never makes the first registered user an admin, and registration cannot set a role', async () => {
    const first = await registerUser(ctx.app);
    expect(await adminCount()).toBe(0);
    const forged = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'sneaky@example.com',
        password: STRONG_PASSWORD,
        displayName: 'Sneaky',
        role: 'admin',
      },
    });
    expect(forged.statusCode).toBe(400);
    const patched = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: first.headers,
      payload: { role: 'admin' },
    });
    expect(patched.statusCode).toBe(400);
    expect(await adminCount()).toBe(0);
  });

  it('runAdminCreate prompts only for a new account and enforces the policy', async () => {
    const readPassword = vi.fn(async () => 'password1234');
    await expect(
      runAdminCreate(ctx.client.db, {
        email: 'weak@example.com',
        displayName: undefined,
        readPassword,
      }),
    ).rejects.toThrow(/too weak/);
    expect(await adminCount()).toBe(0);
    const strong = vi.fn(async () => STRONG_PASSWORD);
    const created = await runAdminCreate(ctx.client.db, {
      email: 'root@example.com',
      displayName: 'Root',
      readPassword: strong,
    });
    expect(created).toBe('created');
    const existing = await registerUser(ctx.app);
    const never = vi.fn(async () => 'unused');
    await expect(
      runAdminCreate(ctx.client.db, {
        email: existing.email,
        displayName: undefined,
        readPassword: never,
      }),
    ).rejects.toThrow(/admin:promote/);
    expect(never).not.toHaveBeenCalled();
    expect(await adminCount()).toBe(1);
    // admin:promote is the explicit, audited route for an existing account.
    expect(await runAdminPromote(ctx.client.db, existing.email)).toBe('promoted');
    expect(await auditRows(ctx.owner, ['admin.user_role_changed'])).toHaveLength(1);
    expect(await runAdminPromote(ctx.client.db, 'nobody@example.com')).toBe('user_not_found');
  });

  it('readFirstLine returns the first line only, without the line ending', async () => {
    expect(await readFirstLine(Readable.from(['pass', 'phrase\r\nsecond line\n']))).toBe(
      'passphrase',
    );
    expect(await readFirstLine(Readable.from(['no newline at all']))).toBe('no newline at all');
    expect(await readFirstLine(Readable.from([]))).toBe('');
  });
});

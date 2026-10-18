import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createAdmin, promoteUser } from '../../src/modules/admin/bootstrap.js';
import { argon2Hasher } from '../../src/modules/auth/password-hasher.js';
import {
  auditRows,
  createIntegrationContext,
  registerUser,
  STRONG_PASSWORD,
  type IntegrationContext,
} from '../support/api.js';
import { describeDb, truncateAll } from '../support/db.js';

describeDb('first-admin bootstrap (real PostgreSQL, ADR-013)', () => {
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
  const role = async (id: string) =>
    (await ctx.owner.query('select role from users where id = $1', [id])).rows[0]?.role as string;

  it('admin:promote promotes once, audits with a system actor, and is idempotent', async () => {
    const user = await registerUser(ctx.app);
    expect(await promoteUser(deps(), user.email)).toBe('promoted');
    expect(await role(user.id)).toBe('admin');
    expect(await promoteUser(deps(), user.email)).toBe('already_admin');
    expect(await promoteUser(deps(), 'ghost@example.com')).toBe('user_not_found');
    const rows = await auditRows(ctx.owner, ['admin.user_role_changed']);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor_user_id: null,
      target_type: 'user',
      target_id: user.id,
      metadata: { from: 'user', to: 'admin', via: 'cli' },
    });
    const me = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/admin/users',
      headers: user.headers,
    });
    expect(me.statusCode).toBe(200);
  });

  it('admin:create makes a working admin account and audits system.admin_bootstrapped', async () => {
    const passwordHash = await argon2Hasher.hash(STRONG_PASSWORD);
    const outcome = await createAdmin(deps(), {
      email: 'root@example.com',
      displayName: 'Root',
      passwordHash,
    });
    expect(outcome).toBe('created');
    const login = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'root@example.com', password: STRONG_PASSWORD },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json<{ user: { role: string } }>().user.role).toBe('admin');
    const [row] = await auditRows(ctx.owner, ['system.admin_bootstrapped']);
    expect(row).toMatchObject({
      actor_user_id: null,
      target_type: 'user',
      metadata: { via: 'cli' },
    });
    // Running it again is refused (the email now exists) and writes no further audit row.
    expect(
      await createAdmin(deps(), { email: 'root@example.com', displayName: 'Root', passwordHash }),
    ).toBe('email_exists');
    expect(
      await auditRows(ctx.owner, ['system.admin_bootstrapped', 'admin.user_role_changed']),
    ).toHaveLength(1);
  });

  it('admin:create refuses an existing account: no promotion, password and role untouched, no audit', async () => {
    const user = await registerUser(ctx.app);
    const before = await ctx.owner.query('select password_hash from users where id = $1', [
      user.id,
    ]);
    const outcome = await createAdmin(deps(), {
      email: user.email,
      displayName: 'Ignored',
      passwordHash: await argon2Hasher.hash('another passphrase 99'),
    });
    expect(outcome).toBe('email_exists');
    const after = await ctx.owner.query(
      'select password_hash, display_name, role from users where id = $1',
      [user.id],
    );
    expect(after.rows[0].password_hash).toBe(before.rows[0].password_hash);
    expect(after.rows[0].display_name).not.toBe('Ignored');
    expect(after.rows[0].role).toBe('user');
    expect(
      await auditRows(ctx.owner, ['system.admin_bootstrapped', 'admin.user_role_changed']),
    ).toHaveLength(0);
  });

  it('admin:create racing a registration of the same email: exactly one account, never promoted over a registered one', async () => {
    const email = 'race@example.com';
    const passwordHash = await argon2Hasher.hash(STRONG_PASSWORD);
    const [created, registered] = await Promise.all([
      createAdmin(deps(), { email, displayName: 'Root', passwordHash }),
      registerUser(ctx.app, { email }).then(
        () => 'registered',
        () => 'register_failed',
      ),
    ]);
    const rows = (await ctx.owner.query('select role from users where email = $1', [email])).rows;
    expect(rows).toHaveLength(1);
    // Whoever won owns the account; the other side failed loudly instead of overwriting it.
    if (created === 'created') {
      expect(rows[0].role).toBe('admin');
      expect(registered).toBe('register_failed');
    } else {
      expect(created).toBe('email_exists');
      expect(rows[0].role).toBe('user');
    }
  });

  it('concurrent admin:create calls for one email create it once and refuse the loser', async () => {
    const passwordHash = await argon2Hasher.hash(STRONG_PASSWORD);
    const input = { email: 'twin@example.com', displayName: 'Twin', passwordHash };
    const outcomes = await Promise.all([
      createAdmin(deps(), input),
      createAdmin(deps(), input),
      createAdmin(deps(), input),
    ]);
    expect(outcomes.filter((o) => o === 'created')).toHaveLength(1);
    expect(outcomes.filter((o) => o === 'email_exists')).toHaveLength(2);
  });
});

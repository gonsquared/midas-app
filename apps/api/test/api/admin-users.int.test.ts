import { AdminUserDetailSchema, AdminUserPageSchema, type AdminUser } from '@midas/shared';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createIntegrationContext, type IntegrationContext } from '../support/api.js';
import { adminHelpers } from '../support/admin.js';
import { describeDb, truncateAll } from '../support/db.js';

const MISSING = '0198f2a1-7c3e-7b1a-8e2d-4f5a6b7c8d9e';

describeDb('admin user management: authorization and listing (real PostgreSQL, E9-F2-S2)', () => {
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
  const { call, code, admin, user } = adminHelpers(() => ctx);

  const ADMIN_ROUTES: Array<[string, string]> = [
    ['GET', '/api/v1/admin/users'],
    ['GET', `/api/v1/admin/users/${MISSING}`],
    ['POST', `/api/v1/admin/users/${MISSING}/suspend`],
    ['POST', `/api/v1/admin/users/${MISSING}/reactivate`],
    ['PATCH', `/api/v1/admin/users/${MISSING}/role`],
    ['GET', '/api/v1/admin/categories'],
    ['POST', '/api/v1/admin/categories'],
    ['PATCH', `/api/v1/admin/categories/${MISSING}`],
    ['POST', `/api/v1/admin/categories/${MISSING}/retire`],
    ['POST', `/api/v1/admin/categories/${MISSING}/restore`],
    ['GET', '/api/v1/admin/metrics'],
    ['GET', '/api/v1/admin/audit-logs'],
  ];

  it.each(ADMIN_ROUTES)('%s %s needs authentication and the admin role', async (method, url) => {
    const anonymous = await call(method as 'GET', url, null);
    expect(anonymous.statusCode).toBe(401);
    const regular = await call(method as 'GET', url, await user(), {});
    expect(regular.statusCode).toBe(403);
    expect(code(regular)).toBe('FORBIDDEN');
    expect(regular.json<{ detail: string }>().detail).toBe(
      'You do not have permission to perform this action.',
    );
  });

  it('reads the role from the database on every request: demotion applies immediately', async () => {
    const boss = await admin();
    expect((await call('GET', '/api/v1/admin/users', boss)).statusCode).toBe(200);
    await ctx.owner.query(`update users set role = 'user' where id = $1`, [boss.id]);
    expect((await call('GET', '/api/v1/admin/users', boss)).statusCode).toBe(403);
    await ctx.owner.query(
      `update users set role = 'admin', status = 'suspended', suspended_at = now() where id = $1`,
      [boss.id],
    );
    expect((await call('GET', '/api/v1/admin/users', boss)).statusCode).toBe(401);
  });

  it('lists users with paging, search, filters and sorting, and never exposes secrets', async () => {
    const boss = await admin({ displayName: 'Zed Admin' });
    await user({ displayName: 'Alice Anderson' });
    await user({ displayName: 'Bob 100%_Real' });
    const res = await call('GET', '/api/v1/admin/users?sort=email_asc&pageSize=2', boss);
    expect(res.statusCode).toBe(200);
    const page = AdminUserPageSchema.parse(res.json());
    expect(page).toMatchObject({ page: 1, pageSize: 2, totalItems: 3, totalPages: 2 });
    expect(page.items).toHaveLength(2);
    expect(res.body).not.toMatch(/password|hash|token/i);
    const emails = page.items.map((u: AdminUser) => u.email);
    expect(emails).toEqual([...emails].sort());
    const second = AdminUserPageSchema.parse(
      (await call('GET', '/api/v1/admin/users?sort=email_asc&pageSize=2&page=2', boss)).json(),
    );
    expect(second.items).toHaveLength(1);
    const search = AdminUserPageSchema.parse(
      (await call('GET', '/api/v1/admin/users?q=alice', boss)).json(),
    );
    expect(search.items.map((u: AdminUser) => u.displayName)).toEqual(['Alice Anderson']);
    // LIKE metacharacters in the search are literal, not wildcards.
    const literal = AdminUserPageSchema.parse(
      (await call('GET', '/api/v1/admin/users?q=100%25_', boss)).json(),
    );
    expect(literal.items.map((u: AdminUser) => u.displayName)).toEqual(['Bob 100%_Real']);
    expect(
      AdminUserPageSchema.parse((await call('GET', '/api/v1/admin/users?q=Ali%25son', boss)).json())
        .totalItems,
    ).toBe(0);
    const admins = AdminUserPageSchema.parse(
      (await call('GET', '/api/v1/admin/users?role=admin', boss)).json(),
    );
    expect(admins.items.map((u: AdminUser) => u.id)).toEqual([boss.id]);
  });

  it('filters by status and rejects invalid list parameters', async () => {
    const boss = await admin();
    const target = await user();
    await call('POST', `/api/v1/admin/users/${target.id}/suspend`, boss, {});
    const suspended = AdminUserPageSchema.parse(
      (await call('GET', '/api/v1/admin/users?status=suspended', boss)).json(),
    );
    expect(suspended.items.map((u: AdminUser) => u.id)).toEqual([target.id]);
    for (const query of [
      'page=0',
      'pageSize=101',
      'pageSize=0',
      'sort=password_asc',
      'role=root',
      'status=gone',
      'q=',
      'extra=1',
      'page=x',
    ]) {
      const res = await call('GET', `/api/v1/admin/users?${query}`, boss);
      expect(res.statusCode, query).toBe(400);
      expect(code(res)).toBe('VALIDATION_FAILED');
    }
    const never = AdminUserDetailSchema.safeParse(
      (await call('GET', `/api/v1/admin/users/${target.id}`, boss)).json(),
    );
    expect(never.success).toBe(true);
    expect((await call('GET', `/api/v1/admin/users/${MISSING}`, boss)).statusCode).toBe(404);
    expect((await call('GET', '/api/v1/admin/users/not-a-uuid', boss)).statusCode).toBe(400);
  });
});

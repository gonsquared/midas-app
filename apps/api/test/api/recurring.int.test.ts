import { RecurringTemplateSchema, type RecurringTemplate } from '@midas/shared';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import {
  createIntegrationContext,
  registerUser,
  type IntegrationContext,
  type TestUser,
} from '../support/api.js';
import { describeDb, truncateAll } from '../support/db.js';
import {
  createCategory,
  createTransaction,
  createWallet,
  expectLedgerConsistent,
  systemCategory,
} from '../support/ledger.js';

const MISSING = '0198f2a1-7c3e-7b1a-8e2d-4f5a6b7c8d9e';

describeDb('recurring templates API (real PostgreSQL, E8-F1-S3)', () => {
  let ctx: IntegrationContext;
  beforeAll(async () => {
    ctx = await createIntegrationContext();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await truncateAll(ctx.owner);
    ctx.clock.set(new Date('2026-10-18T12:00:00.000Z'));
  });
  afterEach(async () => {
    await expectLedgerConsistent(ctx.owner);
  });

  const call = (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    user: TestUser,
    payload?: unknown,
  ) =>
    ctx.app.inject({
      method,
      url,
      headers: user.headers,
      ...(payload !== undefined && { payload: payload as object }),
    });
  const code = (res: { json: () => unknown }) => (res.json() as { code: string }).code;

  async function setup() {
    const user = await registerUser(ctx.app, { currency: 'USD' });
    const wallet = await createWallet(ctx.app, user, { name: 'Main', currency: 'USD' });
    const rent = await systemCategory(ctx.app, user, 'expense', 'Housing');
    const salary = await systemCategory(ctx.app, user, 'income', 'Salary');
    const body = (overrides: Record<string, unknown> = {}) => ({
      name: 'Rent',
      type: 'expense',
      walletId: wallet.id,
      categoryId: rent.id,
      amountMinor: 120000,
      frequency: 'monthly',
      startDate: '2026-11-01',
      ...overrides,
    });
    const create = async (overrides: Record<string, unknown> = {}) => {
      const res = await call('POST', '/api/v1/recurring-templates', user, body(overrides));
      if (res.statusCode !== 201) throw new Error(`create failed: ${res.body}`);
      return RecurringTemplateSchema.parse(res.json()) as RecurringTemplate;
    };
    return { user, wallet, rent, salary, body, create };
  }

  it('creates an active template with the wallet currency and the start date as first run', async () => {
    const { create, wallet, rent } = await setup();
    const template = await create({ note: 'Flat 3B', endDate: '2027-10-31' });
    expect(template).toMatchObject({
      name: 'Rent',
      type: 'expense',
      status: 'active',
      frequency: 'monthly',
      interval: 1,
      amountMinor: 120000,
      currency: 'USD',
      note: 'Flat 3B',
      startDate: '2026-11-01',
      endDate: '2027-10-31',
      nextRunOn: '2026-11-01',
      lastRunAt: null,
      lastError: null,
      consecutiveFailures: 0,
    });
    expect(template.wallet).toMatchObject({ id: wallet.id, name: 'Main', archived: false });
    expect(template.category).toMatchObject({ id: rent.id, name: 'Housing', system: true });
  });

  it('supports daily, weekly, monthly and yearly with an interval', async () => {
    const { create } = await setup();
    for (const [frequency, interval] of [
      ['daily', 3],
      ['weekly', 2],
      ['monthly', 1],
      ['yearly', 1],
    ] as const) {
      const template = await create({ name: `T ${frequency}`, frequency, interval });
      expect(template).toMatchObject({ frequency, interval, nextRunOn: '2026-11-01' });
    }
  });

  it('accepts a start date up to 31 days back and rejects older ones', async () => {
    const { user, body } = await setup();
    const ok = await call(
      'POST',
      '/api/v1/recurring-templates',
      user,
      body({ startDate: '2026-09-17' }),
    );
    expect(ok.statusCode).toBe(201);
    expect(ok.json<RecurringTemplate>().nextRunOn).toBe('2026-09-17');
    const old = await call(
      'POST',
      '/api/v1/recurring-templates',
      user,
      body({ name: 'Old', startDate: '2026-09-16' }),
    );
    expect(old.statusCode).toBe(400);
    expect(old.json()).toMatchObject({
      code: 'VALIDATION_FAILED',
      errors: [{ field: 'startDate', code: 'TOO_OLD' }],
    });
  });

  it('validates references and the category type', async () => {
    const { user, wallet, salary, body } = await setup();
    const other = await registerUser(ctx.app);
    const foreignWallet = await createWallet(ctx.app, other, { currency: 'USD' });
    const foreignCategory = await createCategory(ctx.app, other, { name: 'Private' });
    const post = (overrides: Record<string, unknown>) =>
      call('POST', '/api/v1/recurring-templates', user, body(overrides));
    expect(code(await post({ walletId: foreignWallet.id }))).toBe('INVALID_REFERENCE');
    expect(code(await post({ walletId: MISSING }))).toBe('INVALID_REFERENCE');
    expect(code(await post({ categoryId: foreignCategory.id }))).toBe('INVALID_REFERENCE');
    expect(code(await post({ categoryId: salary.id }))).toBe('CATEGORY_TYPE_MISMATCH');
    await ctx.owner.query('update categories set retired_at = now() where id = $1', [salary.id]);
    expect(code(await post({ type: 'income', categoryId: salary.id }))).toBe('CATEGORY_RETIRED');
    await call('POST', `/api/v1/wallets/${wallet.id}/archive`, user);
    const archived = await post({});
    expect(archived.statusCode).toBe(409);
    expect(code(archived)).toBe('WALLET_ARCHIVED');
  });
});

describeDb('recurring template lifecycle (real PostgreSQL)', () => {
  let ctx: IntegrationContext;
  beforeAll(async () => {
    ctx = await createIntegrationContext();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await truncateAll(ctx.owner);
    ctx.clock.set(new Date('2026-10-18T12:00:00.000Z'));
  });
  afterEach(async () => {
    await expectLedgerConsistent(ctx.owner);
  });

  const call = (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    user: TestUser,
    payload?: unknown,
  ) =>
    ctx.app.inject({
      method,
      url,
      headers: user.headers,
      ...(payload !== undefined && { payload: payload as object }),
    });
  const code = (res: { json: () => unknown }) => (res.json() as { code: string }).code;

  async function setup() {
    const user = await registerUser(ctx.app, { currency: 'USD' });
    const wallet = await createWallet(ctx.app, user, { name: 'Main', currency: 'USD' });
    const rent = await systemCategory(ctx.app, user, 'expense', 'Housing');
    const create = async (overrides: Record<string, unknown> = {}) => {
      const res = await call('POST', '/api/v1/recurring-templates', user, {
        name: 'Rent',
        type: 'expense',
        walletId: wallet.id,
        categoryId: rent.id,
        amountMinor: 120000,
        frequency: 'monthly',
        startDate: '2026-11-15',
        ...overrides,
      });
      if (res.statusCode !== 201) throw new Error(`create failed: ${res.body}`);
      return res.json<RecurringTemplate>();
    };
    return { user, wallet, rent, create };
  }

  it('edits fields; schedule changes recompute the next run from today without backfill', async () => {
    const { user, create } = await setup();
    const template = await create({ startDate: '2026-09-20', frequency: 'weekly' });
    expect(template.nextRunOn).toBe('2026-09-20');
    const renamed = await call('PATCH', `/api/v1/recurring-templates/${template.id}`, user, {
      name: 'Gym',
      amountMinor: 4500,
      note: 'monthly dues',
    });
    expect(renamed.json<RecurringTemplate>()).toMatchObject({
      name: 'Gym',
      amountMinor: 4500,
      nextRunOn: '2026-09-20',
    });
    const rescheduled = await call('PATCH', `/api/v1/recurring-templates/${template.id}`, user, {
      frequency: 'monthly',
    });
    // monthly from 2026-09-20: the first occurrence on or after 2026-10-18 is 2026-10-20
    expect(rescheduled.json<RecurringTemplate>()).toMatchObject({
      frequency: 'monthly',
      nextRunOn: '2026-10-20',
    });
    const cleared = await call('PATCH', `/api/v1/recurring-templates/${template.id}`, user, {
      note: null,
      endDate: '2026-12-31',
    });
    expect(cleared.json<RecurringTemplate>()).toMatchObject({
      note: null,
      endDate: '2026-12-31',
      nextRunOn: '2026-10-20',
    });
  });

  it('ends a template when no occurrence is left and then refuses edits', async () => {
    const { user, create } = await setup();
    const template = await create({ startDate: '2026-10-01', frequency: 'daily' });
    const ended = await call('PATCH', `/api/v1/recurring-templates/${template.id}`, user, {
      endDate: '2026-10-10',
    });
    expect(ended.json<RecurringTemplate>()).toMatchObject({ status: 'ended', nextRunOn: null });
    for (const [method, path, payload] of [
      ['PATCH', '', { name: 'x' }],
      ['POST', '/pause', undefined],
      ['POST', '/resume', undefined],
    ] as const) {
      const res = await call(
        method,
        `/api/v1/recurring-templates/${template.id}${path}`,
        user,
        payload,
      );
      expect(res.statusCode, path).toBe(409);
      expect(code(res)).toBe('TEMPLATE_ENDED');
    }
  });

  it('pauses and resumes idempotently; resume skips the paused period', async () => {
    const { user, create } = await setup();
    const template = await create({ startDate: '2026-10-01', frequency: 'weekly' });
    const url = `/api/v1/recurring-templates/${template.id}`;
    expect((await call('POST', `${url}/pause`, user)).json<RecurringTemplate>().status).toBe(
      'paused',
    );
    expect((await call('POST', `${url}/pause`, user)).json<RecurringTemplate>().status).toBe(
      'paused',
    );
    await ctx.owner.query(
      `update recurring_templates set consecutive_failures = 4, last_error = 'DATABASE_ERROR' where id = $1`,
      [template.id],
    );
    const resumed = await call('POST', `${url}/resume`, user);
    expect(resumed.json<RecurringTemplate>()).toMatchObject({
      status: 'active',
      nextRunOn: '2026-10-22', // not the missed 2026-10-01: nothing is backfilled
      consecutiveFailures: 0,
      lastError: null,
    });
    expect((await call('POST', `${url}/resume`, user)).json<RecurringTemplate>().nextRunOn).toBe(
      '2026-10-22',
    );
  });
});

describeDb('recurring templates: ownership, wallet and category rules (real PostgreSQL)', () => {
  let ctx: IntegrationContext;
  beforeAll(async () => {
    ctx = await createIntegrationContext();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await truncateAll(ctx.owner);
    ctx.clock.set(new Date('2026-10-18T12:00:00.000Z'));
  });
  afterEach(async () => {
    await expectLedgerConsistent(ctx.owner);
  });

  const call = (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    user: TestUser,
    payload?: unknown,
  ) =>
    ctx.app.inject({
      method,
      url,
      headers: user.headers,
      ...(payload !== undefined && { payload: payload as object }),
    });
  const code = (res: { json: () => unknown }) => (res.json() as { code: string }).code;

  async function setup() {
    const user = await registerUser(ctx.app, { currency: 'USD' });
    const wallet = await createWallet(ctx.app, user, { name: 'Main', currency: 'USD' });
    const rent = await systemCategory(ctx.app, user, 'expense', 'Housing');
    const create = async (overrides: Record<string, unknown> = {}) => {
      const res = await call('POST', '/api/v1/recurring-templates', user, {
        name: 'Rent',
        type: 'expense',
        walletId: wallet.id,
        categoryId: rent.id,
        amountMinor: 120000,
        frequency: 'monthly',
        startDate: '2026-11-15',
        ...overrides,
      });
      if (res.statusCode !== 201) throw new Error(`create failed: ${res.body}`);
      return res.json<RecurringTemplate>();
    };
    return { user, wallet, rent, create };
  }

  it('returns 404 for every operation on another users template (IDOR)', async () => {
    const owner = await setup();
    const template = await owner.create();
    const intruder = await registerUser(ctx.app);
    const base = `/api/v1/recurring-templates/${template.id}`;
    const attempts = [
      ['GET', base, undefined],
      ['PATCH', base, { name: 'Hacked' }],
      ['POST', `${base}/pause`, undefined],
      ['POST', `${base}/resume`, undefined],
      ['DELETE', base, undefined],
      ['GET', `${base}/runs`, undefined],
    ] as const;
    for (const [method, url, payload] of attempts) {
      const res = await call(method, url, intruder, payload);
      expect(res.statusCode, `${method} ${url}`).toBe(404);
      expect(code(res)).toBe('NOT_FOUND');
    }
    const list = await call('GET', '/api/v1/recurring-templates', intruder);
    expect(list.json<{ items: unknown[] }>().items).toEqual([]);
    const intact = await call('GET', base, owner.user);
    expect(intact.json<RecurringTemplate>()).toMatchObject({ name: 'Rent', status: 'active' });
  });

  it('refuses to move a template to another users wallet or category', async () => {
    const owner = await setup();
    const template = await owner.create();
    const other = await registerUser(ctx.app);
    const foreignWallet = await createWallet(ctx.app, other, { currency: 'USD' });
    const foreignCategory = await createCategory(ctx.app, other, { name: 'Private' });
    const url = `/api/v1/recurring-templates/${template.id}`;
    const wallet = await call('PATCH', url, owner.user, { walletId: foreignWallet.id });
    expect(wallet.statusCode).toBe(422);
    expect(code(wallet)).toBe('INVALID_REFERENCE');
    const category = await call('PATCH', url, owner.user, { categoryId: foreignCategory.id });
    expect(code(category)).toBe('INVALID_REFERENCE');
    const income = await systemCategory(ctx.app, owner.user, 'income');
    expect(code(await call('PATCH', url, owner.user, { categoryId: income.id }))).toBe(
      'CATEGORY_TYPE_MISMATCH',
    );
    expect(code(await call('PATCH', url, owner.user, { type: 'income' }))).toBe(
      'VALIDATION_FAILED',
    );
  });

  it('archiving a wallet pauses its active templates; unarchiving leaves them paused', async () => {
    const { user, wallet, create } = await setup();
    const savings = await createWallet(ctx.app, user, { name: 'Other', currency: 'USD' });
    const active = await create({ name: 'A' });
    const elsewhere = await create({ name: 'B', walletId: savings.id });
    await call('POST', `/api/v1/wallets/${wallet.id}/archive`, user);
    const get = async (id: string) =>
      (await call('GET', `/api/v1/recurring-templates/${id}`, user)).json<RecurringTemplate>();
    expect((await get(active.id)).status).toBe('paused');
    expect((await get(elsewhere.id)).status).toBe('active');
    const resume = await call('POST', `/api/v1/recurring-templates/${active.id}/resume`, user);
    expect(resume.statusCode).toBe(409);
    expect(code(resume)).toBe('WALLET_ARCHIVED');
    await call('POST', `/api/v1/wallets/${wallet.id}/unarchive`, user);
    expect((await get(active.id)).status).toBe('paused');
    const resumed = await call('POST', `/api/v1/recurring-templates/${active.id}/resume`, user);
    expect(resumed.json<RecurringTemplate>().status).toBe('active');
  });

  it('keeps the wallet while a template uses it: no delete, no currency change', async () => {
    const { user, wallet, create } = await setup();
    await create();
    const removed = await call('DELETE', `/api/v1/wallets/${wallet.id}`, user);
    expect(removed.statusCode).toBe(409);
    expect(code(removed)).toBe('WALLET_IN_USE');
    const currency = await call('PATCH', `/api/v1/wallets/${wallet.id}`, user, { currency: 'EUR' });
    expect(currency.statusCode).toBe(409);
    expect(code(currency)).toBe('WALLET_CURRENCY_LOCKED');
  });

  it('a category used by a template needs reassignTo, which moves the template', async () => {
    const { user, wallet, create } = await setup();
    const mine = await createCategory(ctx.app, user, { name: 'Landlord' });
    const target = await createCategory(ctx.app, user, { name: 'Housing 2' });
    const template = await create({ categoryId: mine.id });
    await createTransaction(ctx.app, user, {
      type: 'expense',
      walletId: wallet.id,
      categoryId: mine.id,
      amountMinor: 5,
      occurredOn: '2026-10-01',
    });
    const blocked = await call('DELETE', `/api/v1/categories/${mine.id}`, user);
    expect(code(blocked)).toBe('CATEGORY_IN_USE');
    const moved = await call(
      'DELETE',
      `/api/v1/categories/${mine.id}?reassignTo=${target.id}`,
      user,
    );
    expect(moved.json()).toMatchObject({
      reassignedTransactions: 1,
      reassignedTemplates: 1,
      deletedBudgets: 0,
    });
    const reloaded = await call('GET', `/api/v1/recurring-templates/${template.id}`, user);
    expect(reloaded.json<RecurringTemplate>().category.id).toBe(target.id);
  });
});

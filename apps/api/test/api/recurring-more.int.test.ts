import type { RecurringTemplate } from '@midas/shared';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { createIntegrationContext, type IntegrationContext } from '../support/api.js';
import { describeDb, truncateAll } from '../support/db.js';
import { expectLedgerConsistent } from '../support/ledger.js';
import { recurringHelpers } from '../support/recurring.js';

describeDb('recurring templates: list, delete and preview (real PostgreSQL)', () => {
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
  const { call, setup } = recurringHelpers(() => ctx);

  it('lists by next run (soonest first, ended last) and filters by status', async () => {
    const { user, create } = await setup();
    const late = await create({ name: 'Late', startDate: '2026-12-01' });
    await create({ name: 'Soon', startDate: '2026-10-20' });
    const paused = await create({ name: 'Paused', startDate: '2026-11-01' });
    await call('POST', `/api/v1/recurring-templates/${paused.id}/pause`, user);
    await ctx.owner.query(
      `update recurring_templates set status = 'ended', next_run_on = null where id = $1`,
      [late.id],
    );
    const all = await call('GET', '/api/v1/recurring-templates', user);
    const names = all.json<{ items: RecurringTemplate[] }>().items.map((t) => t.name);
    expect(names).toEqual(['Soon', 'Paused', 'Late']);
    const only = await call('GET', '/api/v1/recurring-templates?status=paused', user);
    expect(only.json<{ items: RecurringTemplate[] }>().items.map((t) => t.id)).toEqual([paused.id]);
    expect((await call('GET', '/api/v1/recurring-templates?status=weird', user)).statusCode).toBe(
      400,
    );
  });

  it('deletes a template but keeps its generated transactions without the link', async () => {
    const { user, wallet, rent, create } = await setup();
    const template = await create({ startDate: '2026-10-10' });
    const inserted = await ctx.owner.query(
      `insert into transactions (user_id, wallet_id, type, category_id, amount_minor, currency, occurred_on, recurring_template_id)
       values ($1, $2, 'expense', $3, 120000, 'USD', '2026-10-10', $4) returning id`,
      [user.id, wallet.id, rent.id, template.id],
    );
    const txId = inserted.rows[0].id as string;
    await ctx.owner.query(
      `insert into recurring_runs (template_id, occurrence_date, status, transaction_id)
       values ($1, '2026-10-10', 'succeeded', $2)`,
      [template.id, txId],
    );
    const before = await call('GET', `/api/v1/transactions/${txId}`, user);
    expect(before.json<{ recurringTemplateId: string }>().recurringTemplateId).toBe(template.id);
    expect(
      (await call('DELETE', `/api/v1/recurring-templates/${template.id}`, user)).statusCode,
    ).toBe(204);
    const after = await call('GET', `/api/v1/transactions/${txId}`, user);
    expect(after.statusCode).toBe(200);
    expect(after.json<{ recurringTemplateId: string | null }>().recurringTemplateId).toBeNull();
    const runs = await ctx.owner.query('select count(*)::int as n from recurring_runs');
    expect(runs.rows[0].n).toBe(0);
    expect(
      (await call('DELETE', `/api/v1/recurring-templates/${template.id}`, user)).statusCode,
    ).toBe(404);
  });

  it('previews occurrence dates without saving, including month-end clamping', async () => {
    const { user } = await setup();
    const res = await call('POST', '/api/v1/recurring-templates/preview', user, {
      frequency: 'monthly',
      startDate: '2026-01-31',
      fromDate: '2026-02-01',
      count: 4,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ dates: ['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'] });
    const defaults = await call('POST', '/api/v1/recurring-templates/preview', user, {
      frequency: 'weekly',
      startDate: '2026-10-01',
      endDate: '2026-11-01',
    });
    expect(defaults.json<{ dates: string[] }>().dates).toEqual(['2026-10-22', '2026-10-29']);
    const count = await ctx.owner.query('select count(*)::int as n from recurring_templates');
    expect(count.rows[0].n).toBe(0);
    const tooMany = { frequency: 'monthly', startDate: '2026-01-01', count: 25 };
    for (const bad of [{ frequency: 'monthly' }, tooMany]) {
      expect(
        (await call('POST', '/api/v1/recurring-templates/preview', user, bad)).statusCode,
      ).toBe(400);
    }
  });
});

describeDb('recurring run history (real PostgreSQL)', () => {
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
  const { call, code, setup } = recurringHelpers(() => ctx);

  interface RunPage {
    items: Array<{ occurrenceDate: string; status: string; errorCode: string | null }>;
    nextCursor: string | null;
  }

  it('pages the run history newest first and rejects a foreign or malformed cursor', async () => {
    const { user, create } = await setup();
    const template = await create({ startDate: '2026-10-01', frequency: 'daily' });
    const other = await create({ name: 'Other', startDate: '2026-10-01', frequency: 'daily' });
    for (const id of [template.id, other.id]) {
      await ctx.owner.query(
        `insert into recurring_runs (template_id, occurrence_date, status, error_code)
         select $1, date '2026-10-01' + g, 'skipped', 'WALLET_ARCHIVED' from generate_series(0, 6) g`,
        [id],
      );
    }
    const url = `/api/v1/recurring-templates/${template.id}/runs`;
    const page1 = (await call('GET', `${url}?limit=3`, user)).json<RunPage>();
    expect(page1.items.map((r) => r.occurrenceDate)).toEqual([
      '2026-10-07',
      '2026-10-06',
      '2026-10-05',
    ]);
    expect(page1.items[0]).toMatchObject({ status: 'skipped', errorCode: 'WALLET_ARCHIVED' });
    const page2 = (
      await call('GET', `${url}?limit=10&cursor=${page1.nextCursor}`, user)
    ).json<RunPage>();
    expect(page2.items.map((r) => r.occurrenceDate)).toEqual([
      '2026-10-04',
      '2026-10-03',
      '2026-10-02',
      '2026-10-01',
    ]);
    expect(page2.nextCursor).toBeNull();
    const foreign = await call(
      'GET',
      `/api/v1/recurring-templates/${other.id}/runs?cursor=${page1.nextCursor}`,
      user,
    );
    expect(foreign.statusCode).toBe(400);
    expect(code(foreign)).toBe('INVALID_CURSOR');
    expect((await call('GET', `${url}?cursor=%27%3B--`, user)).statusCode).toBe(400);
    expect((await call('GET', `${url}?limit=101`, user)).statusCode).toBe(400);
    expect((await call('GET', `${url}?extra=1`, user)).statusCode).toBe(400);
  });
});

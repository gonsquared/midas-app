import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { createIntegrationContext, type IntegrationContext } from '../support/api.js';
import { describeDb, truncateAll } from '../support/db.js';
import { expectLedgerConsistent } from '../support/ledger.js';
import { generatorKit, recurringHelpers } from '../support/recurring.js';

const at = (iso: string) => new Date(iso);

describeDb('recurring generation is idempotent and safe to run concurrently', () => {
  let ctx: IntegrationContext;
  beforeAll(async () => {
    ctx = await createIntegrationContext();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await truncateAll(ctx.owner);
    ctx.clock.set(at('2026-10-18T12:00:00.000Z'));
    kit.reset();
  });
  afterEach(async () => {
    await expectLedgerConsistent(ctx.owner);
  });
  const { setup } = recurringHelpers(() => ctx);
  const kit = generatorKit(() => ctx);

  it('three runners ticking at once generate every occurrence exactly once', async () => {
    const { create } = await setup();
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) {
      ids.push((await create({ name: `T${i}`, startDate: '2026-10-09', frequency: 'daily' })).id);
    }
    const results = await Promise.all([
      kit.generator().tick(),
      kit.generator().tick(),
      kit.generator().tick(),
    ]);
    expect(results.reduce((sum, r) => sum + r.generated, 0)).toBe(60);
    expect(results.reduce((sum, r) => sum + r.errors, 0)).toBe(0);
    const totals = await ctx.owner.query(
      `select count(*)::int as n, count(distinct (recurring_template_id, occurred_on))::int as uniq
         from transactions where recurring_template_id is not null`,
    );
    expect(totals.rows[0]).toEqual({ n: 60, uniq: 60 });
    const runs = await ctx.owner.query(
      `select count(*)::int as n, count(*) filter (where status = 'succeeded')::int as ok from recurring_runs`,
    );
    expect(runs.rows[0]).toEqual({ n: 60, ok: 60 });
    for (const id of ids) expect((await kit.templateRow(id)).next_run_text).toBe('2026-10-19');
  });

  it('skips a template another runner holds instead of waiting for it (SKIP LOCKED)', async () => {
    const { create } = await setup();
    const template = await create({ startDate: '2026-10-18' });
    const holder = await ctx.owner.connect();
    try {
      await holder.query('begin');
      await holder.query('select id from recurring_templates where id = $1 for update', [
        template.id,
      ]);
      const started = Date.now();
      const result = await kit.generator().tick();
      expect(Date.now() - started).toBeLessThan(3000);
      expect(result.generated).toBe(0);
      expect(await kit.generated(template.id)).toHaveLength(0);
      await holder.query('commit');
    } finally {
      holder.release();
    }
    expect((await kit.generator().tick()).generated).toBe(1);
  });

  it('does not regenerate an occurrence whose transaction the user deleted', async () => {
    const { create } = await setup();
    const template = await create({ startDate: '2026-10-18', frequency: 'daily' });
    await kit.generator().tick();
    await ctx.owner.query('delete from transactions where recurring_template_id = $1', [
      template.id,
    ]);
    expect(await kit.generated(template.id)).toHaveLength(0);
    expect((await kit.generator().tick()).generated).toBe(0);
    expect(await kit.generated(template.id)).toHaveLength(0);
    const runs = await kit.runs(template.id);
    expect(runs).toEqual([
      { d: '2026-10-18', status: 'succeeded', error_code: null, attempts: 1, transaction_id: null },
    ]);
    ctx.clock.set(at('2026-10-19T12:00:00.000Z'));
    expect((await kit.generator().tick()).generated).toBe(1);
  });

  it('only advances when the occurrence already has a succeeded run (unique run key)', async () => {
    const { create } = await setup();
    const template = await create({ startDate: '2026-10-18', frequency: 'weekly' });
    await ctx.owner.query(
      `insert into recurring_runs (template_id, occurrence_date, status) values ($1, '2026-10-18', 'succeeded')`,
      [template.id],
    );
    const result = await kit.generator().tick();
    expect(result).toMatchObject({ generated: 0, advanced: 1 });
    expect(await kit.generated(template.id)).toHaveLength(0);
    expect((await kit.templateRow(template.id)).next_run_text).toBe('2026-10-25');
  });

  it('wallet archiving and template edits racing the scheduler never deadlock or corrupt state', async () => {
    const { user, wallet, create } = await setup();
    const templates = [] as string[];
    for (let i = 0; i < 4; i++) {
      const template = await create({ name: `T${i}`, startDate: '2026-10-10', frequency: 'daily' });
      templates.push(template.id);
    }
    const api = (method: 'POST' | 'PATCH', url: string, payload?: unknown) =>
      ctx.app.inject({
        method,
        url,
        headers: user.headers,
        ...(payload !== undefined && { payload: payload as object }),
      });
    const errors: number[] = [];
    for (let round = 0; round < 6; round++) {
      const results = await Promise.all([
        kit.generator({ maxCatchup: 3 }).tick(),
        kit.generator({ maxCatchup: 3 }).tick(),
        api('POST', `/api/v1/wallets/${wallet.id}/archive`),
        api('PATCH', `/api/v1/recurring-templates/${templates[round % 4]}`, {
          amountMinor: 100 + round,
        }),
      ]);
      errors.push(
        (results[0] as { errors: number }).errors + (results[1] as { errors: number }).errors,
      );
      expect((results[2] as { statusCode: number }).statusCode).toBe(200);
      expect([200, 409]).toContain((results[3] as { statusCode: number }).statusCode);
      await api('POST', `/api/v1/wallets/${wallet.id}/unarchive`);
      for (const id of templates) {
        await ctx.owner.query(
          `update recurring_templates set status = 'active' where id = $1 and status = 'paused'`,
          [id],
        );
      }
    }
    expect(errors.every((n) => n === 0)).toBe(true);
    const dupes = await ctx.owner.query(
      `select count(*)::int as n from (
         select recurring_template_id, occurred_on from transactions
          where recurring_template_id is not null group by 1, 2 having count(*) > 1) d`,
    );
    expect(dupes.rows[0].n).toBe(0);
  });
});

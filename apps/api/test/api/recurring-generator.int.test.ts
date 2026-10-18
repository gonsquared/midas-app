import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { RecurringGenerator, type GeneratorDeps } from '../../src/modules/recurring/generator.js';
import { createIntegrationContext, type IntegrationContext } from '../support/api.js';
import { describeDb, truncateAll } from '../support/db.js';
import { expectLedgerConsistent } from '../support/ledger.js';
import { recurringHelpers } from '../support/recurring.js';

const at = (iso: string) => new Date(iso);

describeDb('recurring generation job (real PostgreSQL, E8-F1-S4)', () => {
  let ctx: IntegrationContext;
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

  beforeAll(async () => {
    ctx = await createIntegrationContext();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await truncateAll(ctx.owner);
    ctx.clock.set(at('2026-10-18T12:00:00.000Z'));
    logger.info.mockClear();
    logger.warn.mockClear();
    logger.error.mockClear();
  });
  afterEach(async () => {
    await expectLedgerConsistent(ctx.owner);
  });
  const { setup } = recurringHelpers(() => ctx);

  const generator = (overrides: Partial<GeneratorDeps> = {}) =>
    new RecurringGenerator({
      db: ctx.client.db,
      clock: ctx.clock,
      maxCatchup: 31,
      maxFailures: 5,
      logger,
      ...overrides,
    });

  const generated = async (templateId: string) =>
    (
      await ctx.owner.query(
        `select occurred_on::text as d, amount_minor::int as amount, note, currency, type, wallet_id
           from transactions where recurring_template_id = $1 order by occurred_on`,
        [templateId],
      )
    ).rows;
  const templateRow = async (id: string) =>
    (
      await ctx.owner.query(
        'select *, next_run_on::text as next_run_text from recurring_templates where id = $1',
        [id],
      )
    ).rows[0];

  it('creates the transaction on its date with the template data and updates the balance', async () => {
    const { wallet, create } = await setup();
    const template = await create({
      startDate: '2026-10-18',
      note: 'October rent',
      amountMinor: 120000,
    });
    const result = await generator().tick();
    expect(result).toMatchObject({ templates: 1, generated: 1, failed: 0, errors: 0 });
    const rows = await generated(template.id);
    expect(rows).toEqual([
      {
        d: '2026-10-18',
        amount: 120000,
        note: 'October rent',
        currency: 'USD',
        type: 'expense',
        wallet_id: wallet.id,
      },
    ]);
    const after = await templateRow(template.id);
    expect(after.next_run_text).toBe('2026-11-18');
    expect(after.last_run_at.toISOString()).toBe('2026-10-18T12:00:00.000Z');
    expect(after.consecutive_failures).toBe(0);
    const run = await ctx.owner.query(
      'select status, transaction_id, attempts, error_code from recurring_runs',
    );
    expect(run.rows).toHaveLength(1);
    expect(run.rows[0]).toMatchObject({ status: 'succeeded', attempts: 1, error_code: null });
    const balance = await ctx.owner.query(
      'select ledger_balance_minor::int as b from wallets where id = $1',
      [wallet.id],
    );
    expect(balance.rows[0].b).toBe(-120000);
  });

  it('does nothing before the occurrence is due and is idempotent afterwards', async () => {
    const { create } = await setup();
    const template = await create({ startDate: '2026-10-19' });
    expect((await generator().tick()).generated).toBe(0);
    ctx.clock.set(at('2026-10-19T08:00:00.000Z'));
    expect((await generator().tick()).generated).toBe(1);
    expect((await generator().tick()).generated).toBe(0);
    expect((await generator().tick()).generated).toBe(0);
    expect(await generated(template.id)).toHaveLength(1);
    const runs = await ctx.owner.query('select count(*)::int as n from recurring_runs');
    expect(runs.rows[0].n).toBe(1);
  });

  it('catches up every missed occurrence on its own date (documented policy)', async () => {
    const { create } = await setup();
    const template = await create({ startDate: '2026-10-01', frequency: 'daily' });
    const result = await generator().tick();
    expect(result.generated).toBe(18);
    const dates = (await generated(template.id)).map((r) => r.d);
    expect(dates[0]).toBe('2026-10-01');
    expect(dates[17]).toBe('2026-10-18');
    expect(new Set(dates).size).toBe(18);
    expect((await templateRow(template.id)).next_run_text).toBe('2026-10-19');
  });

  it('generates at most RECURRING_MAX_CATCHUP per template per tick and continues later', async () => {
    const { create } = await setup();
    const template = await create({ startDate: '2026-10-01', frequency: 'daily' });
    const limited = generator({ maxCatchup: 5 });
    expect((await limited.tick()).generated).toBe(5);
    expect((await generated(template.id)).map((r) => r.d)).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
      '2026-10-05',
    ]);
    for (let i = 0; i < 3; i++) await limited.tick();
    expect(await generated(template.id)).toHaveLength(18);
    expect((await limited.tick()).generated).toBe(0);
  });
});

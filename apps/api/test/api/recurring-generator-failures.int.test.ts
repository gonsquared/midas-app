import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { createIntegrationContext, type IntegrationContext } from '../support/api.js';
import { describeDb, truncateAll } from '../support/db.js';
import { expectLedgerConsistent, systemCategory } from '../support/ledger.js';
import { generatorKit, recurringHelpers } from '../support/recurring.js';

const at = (iso: string) => new Date(iso);
const LIMIT = 100_000_000_000_000;

describeDb('recurring generation failures, retries and skips (real PostgreSQL)', () => {
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

  /** An income template whose transaction would push the wallet balance over the supported range. */
  async function failingTemplate() {
    const { user, wallet } = await setup();
    const salary = await systemCategory(ctx.app, user, 'income', 'Salary');
    await ctx.owner.query('update wallets set opening_balance_minor = $1 where id = $2', [
      LIMIT,
      wallet.id,
    ]);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/recurring-templates',
      headers: user.headers,
      payload: {
        name: 'Bonus',
        type: 'income',
        walletId: wallet.id,
        categoryId: salary.id,
        amountMinor: 5,
        frequency: 'daily',
        startDate: '2026-10-18',
      },
    });
    return { wallet, template: res.json<{ id: string }>() };
  }

  it('records a failed run, keeps the occurrence due, and retries it on the next tick', async () => {
    const { wallet, template } = await failingTemplate();
    const first = await kit.generator().tick();
    expect(first).toMatchObject({ failed: 1, generated: 0 });
    expect(await kit.generated(template.id)).toHaveLength(0);
    expect(await kit.runs(template.id)).toEqual([
      {
        d: '2026-10-18',
        status: 'failed',
        error_code: 'BALANCE_OUT_OF_RANGE',
        attempts: 1,
        transaction_id: null,
      },
    ]);
    const failed = await kit.templateRow(template.id);
    expect(failed).toMatchObject({
      status: 'active',
      consecutive_failures: 1,
      last_error: 'BALANCE_OUT_OF_RANGE',
      next_run_text: '2026-10-18',
    });
    expect(kit.logger.warn).toHaveBeenCalledTimes(1);
    // The failed insert left no trace: the wallet balance is untouched.
    const untouched = await ctx.owner.query(
      'select ledger_balance_minor::int as b from wallets where id = $1',
      [wallet.id],
    );
    expect(untouched.rows[0].b).toBe(0);

    await ctx.owner.query('update wallets set opening_balance_minor = 0 where id = $1', [
      wallet.id,
    ]);
    const retry = await kit.generator().tick();
    expect(retry.generated).toBe(1);
    expect(await kit.runs(template.id)).toEqual([
      {
        d: '2026-10-18',
        status: 'succeeded',
        error_code: null,
        attempts: 2,
        transaction_id: expect.any(String),
      },
    ]);
    expect(await kit.templateRow(template.id)).toMatchObject({
      consecutive_failures: 0,
      last_error: null,
      next_run_text: '2026-10-19',
    });
  });

  it('pauses the template after RECURRING_MAX_FAILURES consecutive failures and logs an error', async () => {
    const { template } = await failingTemplate();
    const generator = kit.generator({ maxFailures: 3 });
    await generator.tick();
    await generator.tick();
    expect(kit.logger.error).not.toHaveBeenCalled();
    expect((await kit.templateRow(template.id)).status).toBe('active');
    await generator.tick();
    expect(await kit.templateRow(template.id)).toMatchObject({
      status: 'paused',
      consecutive_failures: 3,
      last_error: 'BALANCE_OUT_OF_RANGE',
    });
    expect(kit.logger.error).toHaveBeenCalledTimes(1);
    const run = (await kit.runs(template.id))[0];
    expect(run).toMatchObject({ status: 'failed', attempts: 3 });
    expect((await generator.tick()).templates).toBe(0);
  });

  it('records a skipped run and pauses when the wallet was archived behind its back', async () => {
    const { wallet, create } = await setup();
    const template = await create({ startDate: '2026-10-18' });
    await ctx.owner.query('update wallets set archived_at = now() where id = $1', [wallet.id]);
    const result = await kit.generator().tick();
    expect(result).toMatchObject({ skipped: 1, generated: 0 });
    expect(await kit.runs(template.id)).toEqual([
      {
        d: '2026-10-18',
        status: 'skipped',
        error_code: 'WALLET_ARCHIVED',
        attempts: 1,
        transaction_id: null,
      },
    ]);
    expect(await kit.templateRow(template.id)).toMatchObject({
      status: 'paused',
      last_error: 'WALLET_ARCHIVED',
    });
    expect(await kit.generated(template.id)).toHaveLength(0);
  });

  it('records a skipped run and pauses when the category was retired', async () => {
    const { rent, create } = await setup();
    const template = await create({ startDate: '2026-10-18' });
    await ctx.owner.query('update categories set retired_at = now() where id = $1', [rent.id]);
    expect((await kit.generator().tick()).skipped).toBe(1);
    expect(await kit.templateRow(template.id)).toMatchObject({
      status: 'paused',
      last_error: 'CATEGORY_RETIRED',
    });
    expect((await kit.runs(template.id))[0]).toMatchObject({
      status: 'skipped',
      error_code: 'CATEGORY_RETIRED',
    });
  });

  it('a failing template does not stop the others in the same tick', async () => {
    const bad = await failingTemplate();
    const good = await setup();
    const fine = await good.create({ startDate: '2026-10-18' });
    const result = await kit.generator().tick();
    expect(result).toMatchObject({ failed: 1, generated: 1 });
    expect(await kit.generated(fine.id)).toHaveLength(1);
    expect(await kit.generated(bad.template.id)).toHaveLength(0);
  });
});

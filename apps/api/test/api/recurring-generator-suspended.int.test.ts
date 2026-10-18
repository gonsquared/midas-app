import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { createIntegrationContext, type IntegrationContext } from '../support/api.js';
import { describeDb, truncateAll } from '../support/db.js';
import { expectLedgerConsistent } from '../support/ledger.js';
import { generatorKit, recurringHelpers } from '../support/recurring.js';

describeDb('recurring generation skips suspended owners (real PostgreSQL)', () => {
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
  const { setup } = recurringHelpers(() => ctx);
  const kit = generatorKit(() => ctx);

  it('generates nothing for a suspended owner, keeps others running, and resumes after reactivation', async () => {
    const suspended = await setup();
    const active = await setup();
    const frozen = await suspended.create({ startDate: '2026-10-17', frequency: 'daily' });
    const running = await active.create({ startDate: '2026-10-17', frequency: 'daily' });
    await ctx.owner.query(
      `update users set status = 'suspended', suspended_at = now() where id = $1`,
      [suspended.user.id],
    );

    const result = await kit.generator().tick();
    expect(await kit.generated(frozen.id)).toHaveLength(0);
    expect(await kit.generated(running.id)).toHaveLength(2);
    expect(result.generated).toBe(2);
    expect(result.errors).toBe(0);
    // Untouched: still due, still active, no run rows, no failure bookkeeping.
    const row = await kit.templateRow(frozen.id);
    expect(row).toMatchObject({ status: 'active', next_run_text: '2026-10-17' });
    expect(row.consecutive_failures).toBe(0);
    expect(await kit.runs(frozen.id)).toHaveLength(0);

    await ctx.owner.query(
      `update users set status = 'active', suspended_at = null, suspended_reason = null where id = $1`,
      [suspended.user.id],
    );
    await kit.generator().tick();
    expect(await kit.generated(frozen.id)).toHaveLength(2);
  });
});

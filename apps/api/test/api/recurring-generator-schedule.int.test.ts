import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { createIntegrationContext, type IntegrationContext } from '../support/api.js';
import { describeDb, truncateAll } from '../support/db.js';
import { expectLedgerConsistent } from '../support/ledger.js';
import { generatorKit, recurringHelpers } from '../support/recurring.js';

const at = (iso: string) => new Date(iso);

describeDb('recurring generation over time (real PostgreSQL, E8-F1-S4)', () => {
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

  it('simulated time passing: one weekly occurrence per week, ending after the end date', async () => {
    const { create } = await setup();
    const template = await create({
      startDate: '2026-10-19',
      frequency: 'weekly',
      endDate: '2026-11-09',
    });
    const counts: number[] = [];
    for (const day of [
      '2026-10-19',
      '2026-10-25',
      '2026-10-26',
      '2026-11-02',
      '2026-11-09',
      '2026-11-30',
    ]) {
      ctx.clock.set(at(`${day}T09:00:00.000Z`));
      await kit.generator().tick();
      counts.push((await kit.generated(template.id)).length);
    }
    expect(counts).toEqual([1, 1, 2, 3, 4, 4]);
    expect((await kit.generated(template.id)).map((r) => r.d)).toEqual([
      '2026-10-19',
      '2026-10-26',
      '2026-11-02',
      '2026-11-09',
    ]);
    const row = await kit.templateRow(template.id);
    expect(row).toMatchObject({ status: 'ended', next_run_text: null });
    expect((await kit.generator().tick()).templates).toBe(0);
  });

  it('keeps the anchor day for month ends: 31 Jan, 28 Feb, 31 Mar, 30 Apr', async () => {
    ctx.clock.set(at('2027-01-31T09:00:00.000Z'));
    const { create } = await setup();
    const template = await create({ startDate: '2027-01-31', frequency: 'monthly' });
    ctx.clock.set(at('2027-04-30T09:00:00.000Z'));
    await kit.generator().tick();
    expect((await kit.generated(template.id)).map((r) => r.d)).toEqual([
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
      '2027-04-30',
    ]);
    expect((await kit.templateRow(template.id)).next_run_text).toBe('2027-05-31');
  });

  it('evaluates "today" in the time zone of the template owner (ADR-017)', async () => {
    const { create } = await setup({ timezone: 'Pacific/Auckland' });
    const template = await create({ startDate: '2026-10-20' });
    // Auckland is UTC+13 in October: 2026-10-20 begins at 2026-10-19T11:00:00Z.
    ctx.clock.set(at('2026-10-19T10:59:59.000Z'));
    expect((await kit.generator().tick()).generated).toBe(0);
    ctx.clock.set(at('2026-10-19T11:00:00.000Z'));
    expect((await kit.generator().tick()).generated).toBe(1);
    expect((await kit.generated(template.id)).map((r) => r.d)).toEqual(['2026-10-20']);
  });

  it('a user far west of UTC is not served early by the one-day candidate bound', async () => {
    const { create } = await setup({ timezone: 'America/Los_Angeles' });
    const template = await create({ startDate: '2026-10-20' });
    ctx.clock.set(at('2026-10-20T03:00:00.000Z')); // still 19 October in Los Angeles
    expect((await kit.generator().tick()).generated).toBe(0);
    ctx.clock.set(at('2026-10-20T07:00:00.000Z')); // midnight 20 October in Los Angeles
    expect((await kit.generator().tick()).generated).toBe(1);
    expect(await kit.generated(template.id)).toHaveLength(1);
  });

  it('never ticks paused or ended templates', async () => {
    const { user, create } = await setup();
    const paused = await create({ startDate: '2026-10-18', name: 'Paused' });
    await create({ startDate: '2026-10-18', name: 'Live' });
    await ctx.owner.query(`update recurring_templates set status = 'paused' where id = $1`, [
      paused.id,
    ]);
    expect(user.id).toBeDefined();
    const result = await kit.generator().tick();
    expect(result).toMatchObject({ templates: 1, generated: 1 });
    expect(await kit.generated(paused.id)).toHaveLength(0);
  });

  it('stops promptly when the shutdown signal is set', async () => {
    const { create } = await setup();
    const template = await create({ startDate: '2026-10-01', frequency: 'daily' });
    const result = await kit.generator().tick({ aborted: true });
    expect(result.generated).toBe(0);
    expect(await kit.generated(template.id)).toHaveLength(0);
  });
});

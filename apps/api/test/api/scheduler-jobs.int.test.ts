import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { housekeepingTask, runHousekeeping } from '../../src/modules/maintenance/housekeeping.js';
import { createJobs } from '../../src/modules/recurring/jobs.js';
import { loadConfig } from '../../src/platform/config.js';
import { MetricsRegistry } from '../../src/platform/metrics.js';
import { Scheduler } from '../../src/platform/scheduler.js';
import { createIntegrationContext, type IntegrationContext } from '../support/api.js';
import { testEnv } from '../support/app.js';
import { describeDb, truncateAll } from '../support/db.js';
import { generatorKit, recurringHelpers } from '../support/recurring.js';

const at = (iso: string) => new Date(iso);

describeDb('scheduler jobs and housekeeping (real PostgreSQL, ADR-011)', () => {
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
  });
  const { setup } = recurringHelpers(() => ctx);
  const kit = generatorKit(() => ctx);

  it('one scheduler pass generates due occurrences and counts the run', async () => {
    const { create } = await setup();
    const template = await create({ startDate: '2026-10-16', frequency: 'daily' });
    const metrics = new MetricsRegistry();
    const config = loadConfig(testEnv({ RECURRING_MAX_CATCHUP: '2' }));
    const scheduler = new Scheduler({
      tasks: createJobs({
        db: ctx.client.db,
        clock: ctx.clock,
        config,
        logger: kit.logger,
        metrics,
      }),
      intervalMs: 300_000,
      logger: kit.logger,
      counter: metrics.schedulerRuns,
    });
    await scheduler.runOnce();
    expect(await kit.generated(template.id)).toHaveLength(2); // capped by RECURRING_MAX_CATCHUP
    await scheduler.runOnce();
    expect(await kit.generated(template.id)).toHaveLength(3);
    expect(metrics.recurringOccurrences.get({ result: 'generated' })).toBe(3);
    expect(metrics.schedulerRuns.get({ task: 'recurring', result: 'ok' })).toBe(2);
  });

  it('housekeeping deletes old sessions and reset tokens and keeps the recent ones', async () => {
    await setup();
    await ctx.owner.query(`
      insert into sessions (user_id, current_refresh_token_hash, expires_at, revoked_at, revoked_reason, created_at)
      select id, decode(md5(random()::text) || md5(random()::text), 'hex'), now() - interval '40 days',
             null, null, now() - interval '70 days' from users limit 1`);
    await ctx.owner.query(`
      insert into sessions (user_id, current_refresh_token_hash, expires_at, revoked_at, revoked_reason, created_at)
      select id, decode(md5(random()::text) || md5(random()::text), 'hex'), now() + interval '20 days',
             now() - interval '31 days', 'logout', now() - interval '60 days' from users limit 1`);
    await ctx.owner.query(`
      insert into sessions (user_id, current_refresh_token_hash, expires_at, revoked_at, revoked_reason, created_at)
      select id, decode(md5(random()::text) || md5(random()::text), 'hex'), now() - interval '5 days',
             null, null, now() - interval '35 days' from users limit 1`);
    await ctx.owner.query(`
      insert into password_reset_tokens (user_id, token_hash, expires_at, created_at)
      select id, decode(md5(random()::text) || md5(random()::text), 'hex'), now() - interval '2 days',
             now() - interval '3 days' from users limit 1`);
    const before = await ctx.owner.query('select count(*)::int as n from sessions');
    ctx.clock.set(new Date());
    const result = await runHousekeeping(ctx.client.db, ctx.clock);
    expect(result).toEqual({ sessions: 2, resetTokens: 1 });
    const after = await ctx.owner.query('select count(*)::int as n from sessions');
    expect(after.rows[0].n).toBe(before.rows[0].n - 2);
  });

  it('only one instance runs housekeeping at a time (try-lock)', async () => {
    const holder = await ctx.owner.connect();
    try {
      await holder.query('begin');
      await holder.query('select pg_advisory_xact_lock(10, 0)');
      expect(await runHousekeeping(ctx.client.db, ctx.clock)).toBeNull();
      await holder.query('commit');
    } finally {
      holder.release();
    }
    expect(await runHousekeeping(ctx.client.db, ctx.clock)).toEqual({
      sessions: 0,
      resetTokens: 0,
    });
  });

  it('the housekeeping task runs at most once per interval', async () => {
    const info = vi.fn();
    const task = housekeepingTask({ db: ctx.client.db, clock: ctx.clock, logger: { info } });
    await task.run({ aborted: false });
    await task.run({ aborted: false });
    expect(info).toHaveBeenCalledTimes(1);
    ctx.clock.set(at('2026-10-19T13:00:00.000Z'));
    await task.run({ aborted: false });
    expect(info).toHaveBeenCalledTimes(2);
  });

  it('a failed housekeeping run does not postpone the next attempt (lastRun set only on success)', async () => {
    const info = vi.fn();
    const run = vi
      .fn<typeof runHousekeeping>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue({ sessions: 0, resetTokens: 0 });
    const task = housekeepingTask({ db: ctx.client.db, clock: ctx.clock, logger: { info }, run });
    await expect(task.run({ aborted: false })).rejects.toThrow('boom');
    await task.run({ aborted: false }); // retried at once, not after 24 h
    expect(run).toHaveBeenCalledTimes(2);
    expect(info).toHaveBeenCalledTimes(1);
    await task.run({ aborted: false }); // now it waits for the interval
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('deletes in bounded batches: many batches, every expired row gone, fresh rows kept', async () => {
    await setup();
    await ctx.owner.query(`
      insert into sessions (user_id, current_refresh_token_hash, expires_at, created_at)
      select u.id, decode(md5(g::text) || md5((g * 7)::text), 'hex'), now() - interval '40 days',
             now() - interval '70 days'
        from (select id from users limit 1) u, generate_series(1, 25) g`);
    await ctx.owner.query(`
      insert into sessions (user_id, current_refresh_token_hash, expires_at)
      select id, decode(md5('keep') || md5('keep2'), 'hex'), now() + interval '20 days' from users limit 1`);
    ctx.clock.set(new Date());
    const result = await runHousekeeping(ctx.client.db, ctx.clock, 10);
    expect(result?.sessions).toBe(25);
    const left = await ctx.owner.query(
      `select count(*)::int as n from sessions where expires_at < now()`,
    );
    expect(left.rows[0].n).toBe(0);
    const kept = await ctx.owner.query(
      `select count(*)::int as n from sessions where expires_at > now()`,
    );
    expect(kept.rows[0].n).toBeGreaterThanOrEqual(1);
  });
});

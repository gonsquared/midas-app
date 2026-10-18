import type { RecurringTemplate } from '@midas/shared';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { createIntegrationContext, type IntegrationContext } from '../support/api.js';
import { describeDb, truncateAll } from '../support/db.js';
import { createCategory, expectLedgerConsistent, waitForLockWaiters } from '../support/ledger.js';
import { generatorKit, recurringHelpers } from '../support/recurring.js';

/**
 * The recurring generator locks wallet, template, then takes a key-share lock on the category.
 * Category deletion must take its locks in the same order (templates first), or the two deadlock
 * (SQLSTATE 40P01).
 */
describeDb('category delete versus the recurring generator (real PostgreSQL)', () => {
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
  const { setup, call } = recurringHelpers(() => ctx);
  const kit = generatorKit(() => ctx);

  it('a generator holding the template lock can take the category lock while a delete is queued (no deadlock)', async () => {
    const { user, create } = await setup();
    const doomed = await createCategory(ctx.app, user, { name: 'Doomed' });
    const target = await createCategory(ctx.app, user, { name: 'Target' });
    const template = await create({ categoryId: doomed.id, startDate: '2026-10-18' });

    const holder = await ctx.owner.connect();
    try {
      await holder.query('begin');
      // What the generator does first: lock the template.
      await holder.query('select id from recurring_templates where id = $1 for update', [
        template.id,
      ]);
      const deletion = call(
        'DELETE',
        `/api/v1/categories/${doomed.id}?reassignTo=${target.id}`,
        user,
      );
      await waitForLockWaiters(ctx.owner, 1); // the delete queues behind the template lock
      // What the generator does next: key-share the category. Before the fix the delete already
      // held the category FOR UPDATE, so this blocked forever and Postgres raised 40P01.
      await holder.query('select id from categories where id = $1 for key share', [doomed.id]);
      await holder.query('commit');
      const res = await deletion;
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ reassignedTemplates: 1 });
    } finally {
      holder.release();
    }
    const row = await kit.templateRow(template.id);
    expect(row.category_id).toBe(target.id);
  });

  it('repeated deletes racing generator ticks never fail with a deadlock or a server error', async () => {
    const { user, create } = await setup();
    const target = await createCategory(ctx.app, user, { name: 'Target' });
    for (let round = 0; round < 6; round++) {
      const doomed = await createCategory(ctx.app, user, { name: `Doomed ${round}` });
      const templates: RecurringTemplate[] = [];
      for (let i = 0; i < 3; i++) {
        templates.push(
          await create({
            name: `T${round}-${i}`,
            categoryId: doomed.id,
            startDate: '2026-10-10',
            frequency: 'daily',
          }),
        );
      }
      const [result, deletion] = await Promise.all([
        kit.generator().tick(),
        call('DELETE', `/api/v1/categories/${doomed.id}?reassignTo=${target.id}`, user),
      ]);
      expect(deletion.statusCode, deletion.body).toBe(200);
      expect(result.errors).toBe(0);
      ctx.clock.set(new Date('2026-10-18T12:00:00.000Z'));
      for (const t of templates) {
        expect((await kit.templateRow(t.id)).category_id).toBe(target.id);
      }
    }
    expect(kit.logger.error).not.toHaveBeenCalled();
  }, 60_000);
});

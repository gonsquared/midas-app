import type { Kysely } from 'kysely';
import type { Clock } from '../../platform/clock.js';
import type { Config } from '../../platform/config.js';
import type { Database } from '../../platform/db/database.js';
import type { MetricsRegistry } from '../../platform/metrics.js';
import type { ScheduledTask } from '../../platform/scheduler.js';
import { housekeepingTask } from '../maintenance/housekeeping.js';
import { RecurringGenerator, type GeneratorLogger } from './generator.js';

/**
 * The periodic work of the process (ADR-011): recurring generation on every pass and daily
 * housekeeping. `cli jobs:run recurring` runs the first task once without a scheduler.
 */
export function createRecurringTask(deps: {
  db: Kysely<Database>;
  clock: Clock;
  config: Pick<Config, 'scheduler'>;
  logger: GeneratorLogger;
  metrics?: MetricsRegistry | undefined;
}): ScheduledTask {
  const generator = new RecurringGenerator({
    db: deps.db,
    clock: deps.clock,
    maxCatchup: deps.config.scheduler.recurringMaxCatchup,
    maxFailures: deps.config.scheduler.recurringMaxFailures,
    logger: deps.logger,
    counter: deps.metrics?.recurringOccurrences,
  });
  return {
    name: 'recurring',
    async run(signal) {
      const result = await generator.tick(signal);
      if (result.templates > 0) deps.logger.info({ ...result }, 'recurring tick finished');
      return result;
    },
  };
}

export function createJobs(deps: {
  db: Kysely<Database>;
  clock: Clock;
  config: Pick<Config, 'scheduler'>;
  logger: GeneratorLogger;
  metrics?: MetricsRegistry | undefined;
}): ScheduledTask[] {
  return [
    createRecurringTask(deps),
    housekeepingTask({ db: deps.db, clock: deps.clock, logger: deps.logger }),
  ];
}

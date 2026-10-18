import { buildApp } from './app.js';
import { bootstrapAdminFromEnv } from './modules/admin/bootstrap.js';
import { createJobs } from './modules/recurring/jobs.js';
import { systemClock } from './platform/clock.js';
import { ConfigError, loadConfig } from './platform/config.js';
import { createDatabaseClient, poolSettingsFromConfig } from './platform/db/client.js';
import { MetricsRegistry } from './platform/metrics.js';
import { Scheduler } from './platform/scheduler.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const poolLog: { warn?: (obj: object, msg: string) => void } = {};
  const { db, pool } = createDatabaseClient({
    ...poolSettingsFromConfig(config),
    onPoolError: (info) => poolLog.warn?.(info, 'database pool error'),
  });
  const metrics = new MetricsRegistry();
  metrics.setPoolStats(() => ({
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  }));
  const app = await buildApp({ config, db, metrics });
  poolLog.warn = (obj, msg) => app.log.warn(obj, msg);
  for (const warning of config.warnings) app.log.warn({ config: 'startup' }, warning);

  // One-time first-admin fallback (ADR-013): a no-op as soon as any admin exists.
  if (config.bootstrapAdminEmail) {
    try {
      const outcome = await bootstrapAdminFromEnv(
        { db, clock: systemClock },
        config.bootstrapAdminEmail,
      );
      if (outcome === 'email_taken') {
        app.log.error(
          { outcome },
          'BOOTSTRAP_ADMIN_EMAIL refused: an account with that email already exists and its ' +
            'ownership is unverified. No promotion was made. Use `admin:promote` if you own it.',
        );
      } else {
        app.log.info({ outcome }, 'BOOTSTRAP_ADMIN_EMAIL checked');
      }
    } catch (error) {
      app.log.error({ err: error }, 'admin bootstrap failed');
    }
  }

  // In-process scheduler (ADR-011). Several instances are safe: the work is coordinated through
  // the database. Stopping waits for a running pass, before the pool is closed.
  const scheduler = config.scheduler.enabled
    ? new Scheduler({
        tasks: createJobs({ db, clock: systemClock, config, logger: app.log, metrics }),
        intervalMs: config.scheduler.intervalSeconds * 1000,
        logger: app.log,
        counter: metrics.schedulerRuns,
      })
    : undefined;
  app.addHook('onClose', async () => {
    await scheduler?.stop();
  });

  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      await db.destroy();
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, 'error during shutdown');
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ host: config.host, port: config.port });
  scheduler?.start();
}

main().catch((error: unknown) => {
  // Config errors list variable names only, never values.
  if (error instanceof ConfigError) console.error(error.message);
  else console.error('Failed to start the API server', error);
  process.exit(1);
});

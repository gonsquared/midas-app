import { buildApp } from './app.js';
import { ConfigError, loadConfig } from './platform/config.js';
import { createDatabaseClient, poolSettingsFromConfig } from './platform/db/client.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const poolLog: { warn?: (obj: object, msg: string) => void } = {};
  const { db } = createDatabaseClient({
    ...poolSettingsFromConfig(config),
    onPoolError: (info) => poolLog.warn?.(info, 'database pool error'),
  });
  const app = await buildApp({ config, db });
  poolLog.warn = (obj, msg) => app.log.warn(obj, msg);
  for (const warning of config.warnings) app.log.warn({ config: 'DATABASE_SSL' }, warning);

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
}

main().catch((error: unknown) => {
  // Config errors list variable names only, never values.
  if (error instanceof ConfigError) console.error(error.message);
  else console.error('Failed to start the API server', error);
  process.exit(1);
});

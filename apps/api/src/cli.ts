import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { seedSystemCategories } from '../db/seeds/system-categories.js';
import { parseArgs, parseCount } from './cli-args.js';
import {
  parseEmailArg,
  promptHidden,
  readFirstLine,
  runAdminCreate,
  runAdminPromote,
} from './cli-admin.js';
import { createRecurringTask } from './modules/recurring/jobs.js';
import { systemClock } from './platform/clock.js';
import { ConfigError, loadConfig, loadMigrationConnection } from './platform/config.js';
import {
  createDatabaseClient,
  createOwnerDatabaseClient,
  poolSettingsFromConfig,
} from './platform/db/client.js';
import {
  getMigrationStatus,
  MIGRATIONS_DIR,
  runMigrations,
  verifyMigrations,
  type MigrationLogger,
} from './platform/db/migrate.js';

const logger: MigrationLogger = {
  info: (message) => console.log(message),
  warn: (message) => console.warn(message),
};

const USAGE = `Usage: cli <command> [options]

Commands:
  migrate                         Apply all pending migrations
  migrate:down [--count N]        Revert the last N migrations (default 1)
                                  [--confirm-production] is required when NODE_ENV=production
  migrate:status                  List applied and pending migrations
  migrate:verify                  Up, snapshot, down to zero, up again, compare (empty database only)
  migrate:create <name>           Scaffold a migration file (development only), kebab-case name
  seed:system                     Insert missing system categories (idempotent, never overwrites)
  admin:create --email <email>    Create a NEW admin account (fails if the email exists; use admin:promote).
               [--display-name <name>] [--password-stdin]
                                  The password is prompted for (hidden) or read from stdin.
  admin:promote --email <email>   Promote an existing account to admin (audit-logged)
  jobs:run recurring              Run one recurring-generation pass and exit (for cron hosts)`;

const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function utcTimestamp(date = new Date()): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}` +
    pad(date.getUTCMilliseconds(), 3)
  );
}

const TEMPLATE = `import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(\`SET LOCAL lock_timeout = '5s'\`);
  pgm.sql(\`/* reviewed DDL from database design notes */\`);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(\`SET LOCAL lock_timeout = '5s'\`);
  pgm.sql(\`/* exact inverse of up(), or throw to mark it irreversible */\`);
}
`;

async function main(argv: string[]): Promise<number> {
  const { command, positionals, flags } = parseArgs(argv);

  switch (command) {
    case 'migrate': {
      const applied = await runMigrations({
        connection: loadMigrationConnection(),
        direction: 'up',
        logger,
      });
      console.log(applied.length === 0 ? 'No pending migrations.' : `Applied ${applied.length}.`);
      return 0;
    }
    case 'migrate:down': {
      if (process.env.NODE_ENV === 'production' && !flags.has('confirm-production')) {
        console.error('Refusing to revert migrations in production without --confirm-production.');
        return 1;
      }
      const reverted = await runMigrations({
        connection: loadMigrationConnection(),
        direction: 'down',
        count: parseCount(flags.get('count')),
        logger,
      });
      console.log(`Reverted ${reverted.length}.`);
      return 0;
    }
    case 'migrate:status': {
      const status = await getMigrationStatus(loadMigrationConnection());
      for (const entry of status) {
        console.log(`${entry.applied ? 'applied ' : 'pending '} ${entry.name}`);
      }
      return 0;
    }
    case 'migrate:verify': {
      const result = await verifyMigrations(loadMigrationConnection(), logger);
      console.log(`migrate:verify OK (${result.migrations} migrations are reversible).`);
      return 0;
    }
    case 'migrate:create': {
      if (process.env.NODE_ENV === 'production') {
        console.error('migrate:create is for development only.');
        return 1;
      }
      const name = positionals[0];
      if (!name || !NAME_PATTERN.test(name)) {
        console.error('Provide a kebab-case name, for example: create-wallets');
        return 1;
      }
      await mkdir(MIGRATIONS_DIR, { recursive: true });
      const file = path.join(MIGRATIONS_DIR, `${utcTimestamp()}_${name}.ts`);
      await writeFile(file, TEMPLATE, { flag: 'wx' });
      console.log(`Created ${file}`);
      return 0;
    }
    case 'seed:system': {
      const { db } = createOwnerDatabaseClient(loadMigrationConnection());
      try {
        await seedSystemCategories(db, { logger });
      } finally {
        await db.destroy();
      }
      return 0;
    }
    case 'admin:create': {
      const email = parseEmailArg(flags.get('email'));
      const displayName = flags.get('display-name');
      const { db } = createOwnerDatabaseClient(loadMigrationConnection());
      try {
        const outcome = await runAdminCreate(db, {
          email,
          displayName: typeof displayName === 'string' ? displayName : undefined,
          readPassword: () =>
            flags.has('password-stdin')
              ? readFirstLine(process.stdin)
              : promptHidden('Password for the new admin: '),
        });
        console.log(`admin:create: ${outcome}`);
      } finally {
        await db.destroy();
      }
      return 0;
    }
    case 'admin:promote': {
      const email = parseEmailArg(flags.get('email'));
      const { db } = createOwnerDatabaseClient(loadMigrationConnection());
      try {
        const outcome = await runAdminPromote(db, email);
        console.log(`admin:promote: ${outcome}`);
        return outcome === 'user_not_found' ? 1 : 0;
      } finally {
        await db.destroy();
      }
    }
    case 'jobs:run': {
      if (positionals[0] !== 'recurring') {
        console.error('Usage: jobs:run recurring');
        return 1;
      }
      const config = loadConfig();
      const { db } = createDatabaseClient(poolSettingsFromConfig(config));
      try {
        const task = createRecurringTask({
          db,
          clock: systemClock,
          config,
          logger: {
            info: (_obj, message) => console.log(message),
            warn: (_obj, message) => console.warn(message),
            error: (_obj, message) => console.error(message),
          },
        });
        console.log(JSON.stringify(await task.run({ aborted: false })));
      } finally {
        await db.destroy();
      }
      return 0;
    }
    default:
      console.error(USAGE);
      return command === undefined ? 0 : 1;
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    if (error instanceof ConfigError) console.error(error.message);
    else console.error(error instanceof Error ? error.message : 'Command failed');
    process.exitCode = 1;
  },
);

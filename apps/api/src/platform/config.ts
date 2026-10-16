import type { ClientConfig } from 'pg';
import { z } from 'zod';

const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

/** Optional env var: an empty string (as in .env.example) counts as unset. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(emptyToUndefined, schema.optional());

const booleanFlag = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  const v = value.trim().toLowerCase();
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return value;
}, z.boolean());

const positiveInt = (fallback: number, max = Number.MAX_SAFE_INTEGER) =>
  z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(max).default(fallback));

const databaseUrl = z
  .string()
  .min(1)
  .refine((value) => /^postgres(ql)?:\/\//.test(value), {
    message: 'must be a postgres:// or postgresql:// URL',
  });

const NODE_ENVS = ['development', 'test', 'production'] as const;
const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

const EnvSchema = z.object({
  NODE_ENV: z.enum(NODE_ENVS).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: positiveInt(3000, 65535),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  APP_BASE_URL: z.preprocess(emptyToUndefined, z.url().default('http://localhost:5173')),
  APP_VERSION: z.preprocess(emptyToUndefined, z.string().max(64).default('0.0.0')),
  // Number of reverse-proxy hops to trust for the client IP (0 = none).
  TRUST_PROXY: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).max(10).default(0)),

  DATABASE_URL: databaseUrl,
  DATABASE_MIGRATION_URL: optional(databaseUrl),
  DATABASE_POOL_MAX: positiveInt(10, 200),
  DATABASE_STATEMENT_TIMEOUT_MS: positiveInt(15000),
  DATABASE_SSL: optional(z.enum(['off', 'require', 'verify-full'])),
  DATABASE_SSL_CA: optional(z.string()),

  JWT_ACCESS_SECRET: z.string().min(43, 'must be at least 43 characters (32 random bytes, base64)'),
  ACCESS_TOKEN_TTL_SECONDS: positiveInt(600, 3600),
  REFRESH_TOKEN_TTL_DAYS: positiveInt(30, 365),
  SESSION_ABSOLUTE_TTL_DAYS: positiveInt(90, 365),

  RATE_LIMIT_ENABLED: z.preprocess(emptyToUndefined, booleanFlag.default(true)),
  RATE_LIMIT_REGISTER_MAX: positiveInt(5),
  RATE_LIMIT_REGISTER_WINDOW_SECONDS: positiveInt(3600),
});

export interface Config {
  env: (typeof NODE_ENVS)[number];
  host: string;
  port: number;
  logLevel: (typeof LOG_LEVELS)[number];
  appBaseUrl: string;
  appVersion: string;
  trustProxy: number;
  database: {
    url: string;
    migrationUrl: string;
    poolMax: number;
    statementTimeoutMs: number;
    ssl: 'off' | 'require' | 'verify-full';
    sslCa: string | undefined;
  };
  /** Non-fatal configuration findings; the server logs these at boot. */
  warnings: string[];
  auth: {
    jwtAccessSecret: string;
    accessTokenTtlSeconds: number;
    refreshTokenTtlDays: number;
    sessionAbsoluteTtlDays: number;
  };
  rateLimit: {
    enabled: boolean;
    registerMax: number;
    registerWindowSeconds: number;
  };
}

export class ConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

/**
 * Validates environment variables once at boot and fails fast. Messages name the variable
 * only; values (which may be secrets) are never echoed.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(
      parsed.error.issues.map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`),
    );
  }
  const e = parsed.data;

  const problems: string[] = [];
  if (e.NODE_ENV !== 'test' && /change-?me/i.test(e.JWT_ACCESS_SECRET)) {
    problems.push('JWT_ACCESS_SECRET: placeholder value is not allowed outside NODE_ENV=test');
  }
  if (e.NODE_ENV === 'production' && e.DATABASE_SSL === 'off') {
    problems.push('DATABASE_SSL: "off" is not allowed in production');
  }
  if (e.SESSION_ABSOLUTE_TTL_DAYS < e.REFRESH_TOKEN_TTL_DAYS) {
    problems.push('SESSION_ABSOLUTE_TTL_DAYS: must be >= REFRESH_TOKEN_TTL_DAYS');
  }
  if (problems.length > 0) throw new ConfigError(problems);

  const warnings: string[] = [];
  if (e.DATABASE_SSL === 'require') {
    warnings.push(
      'DATABASE_SSL=require encrypts the connection but does not verify the server certificate; use verify-full',
    );
  }

  return {
    warnings,
    env: e.NODE_ENV,
    host: e.HOST,
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    appBaseUrl: e.APP_BASE_URL,
    appVersion: e.APP_VERSION,
    trustProxy: e.TRUST_PROXY,
    database: {
      url: e.DATABASE_URL,
      migrationUrl: e.DATABASE_MIGRATION_URL ?? e.DATABASE_URL,
      poolMax: e.DATABASE_POOL_MAX,
      statementTimeoutMs: e.DATABASE_STATEMENT_TIMEOUT_MS,
      ssl: e.DATABASE_SSL ?? (e.NODE_ENV === 'production' ? 'verify-full' : 'off'),
      sslCa: e.DATABASE_SSL_CA,
    },
    auth: {
      jwtAccessSecret: e.JWT_ACCESS_SECRET,
      accessTokenTtlSeconds: e.ACCESS_TOKEN_TTL_SECONDS,
      refreshTokenTtlDays: e.REFRESH_TOKEN_TTL_DAYS,
      sessionAbsoluteTtlDays: e.SESSION_ABSOLUTE_TTL_DAYS,
    },
    rateLimit: {
      enabled: e.RATE_LIMIT_ENABLED,
      registerMax: e.RATE_LIMIT_REGISTER_MAX,
      registerWindowSeconds: e.RATE_LIMIT_REGISTER_WINDOW_SECONDS,
    },
  };
}

/** Subset used by the migration CLI, which must not require auth secrets. */
export function loadMigrationConnection(env: NodeJS.ProcessEnv = process.env): ClientConfig {
  const parsed = z
    .object({
      NODE_ENV: z.enum(NODE_ENVS).default('development'),
      DATABASE_URL: optional(databaseUrl),
      DATABASE_MIGRATION_URL: optional(databaseUrl),
      DATABASE_SSL: optional(z.enum(['off', 'require', 'verify-full'])),
      DATABASE_SSL_CA: optional(z.string()),
    })
    .safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  }
  const e = parsed.data;
  const url = e.DATABASE_MIGRATION_URL ?? e.DATABASE_URL;
  if (!url) throw new ConfigError(['DATABASE_MIGRATION_URL or DATABASE_URL must be set']);
  const ssl = e.DATABASE_SSL ?? (e.NODE_ENV === 'production' ? 'verify-full' : 'off');
  return {
    connectionString: url,
    // Migrations may legitimately run longer than the API statement timeout.
    options: '-c statement_timeout=0',
    ssl:
      ssl === 'off'
        ? false
        : ssl === 'require'
          ? { rejectUnauthorized: false }
          : { rejectUnauthorized: true, ...(e.DATABASE_SSL_CA ? { ca: e.DATABASE_SSL_CA } : {}) },
  };
}

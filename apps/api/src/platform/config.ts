import type { ClientConfig } from 'pg';
import { z } from 'zod';
import { DEFAULT_RATE_LIMIT_MAX_KEYS } from './rate-limit.js';

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
export const MAIL_TRANSPORTS = ['smtp', 'console', 'memory'] as const;
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
  // Defaults follow architecture 9. Windows are fixed per endpoint; only the maximums are tunable.
  RATE_LIMIT_LOGIN_MAX: positiveInt(5), // per IP + email, per minute
  RATE_LIMIT_LOGIN_IP_MAX: positiveInt(20), // per IP, per minute
  RATE_LIMIT_LOGIN_ACCOUNT_MAX: positiveInt(20), // per account (email hash) across all IPs, per hour
  RATE_LIMIT_FORGOT_EMAIL_MAX: positiveInt(3), // per email hash, per hour
  RATE_LIMIT_FORGOT_IP_MAX: positiveInt(10), // per IP, per hour
  RATE_LIMIT_RESET_MAX: positiveInt(10), // per IP, per hour
  RATE_LIMIT_REFRESH_MAX: positiveInt(30), // per session (or IP when no cookie), per minute
  RATE_LIMIT_PASSWORD_CHANGE_MAX: positiveInt(10), // per user, per hour
  RATE_LIMIT_USER_WRITE_MAX: positiveInt(120), // authenticated writes, per user, per minute
  RATE_LIMIT_USER_READ_MAX: positiveInt(600), // authenticated reads, per user, per minute
  RATE_LIMIT_GLOBAL_IP_MAX: positiveInt(1200), // all /api requests, per IP, per minute
  // Capacity of each limiter's private in-memory store (LRU, one store per limiter).
  RATE_LIMIT_STORE_MAX_KEYS: positiveInt(DEFAULT_RATE_LIMIT_MAX_KEYS, 1_000_000),

  MAIL_TRANSPORT: optional(z.enum(MAIL_TRANSPORTS)),
  MAIL_FROM: z.preprocess(
    emptyToUndefined,
    z.string().min(3).max(254).default('Midas <no-reply@localhost>'),
  ),
  SMTP_HOST: z.preprocess(emptyToUndefined, z.string().min(1).max(253).default('localhost')),
  SMTP_PORT: positiveInt(1025, 65535),
  SMTP_SECURE: z.preprocess(emptyToUndefined, booleanFlag.default(false)),
  SMTP_USER: optional(z.string().max(254)),
  SMTP_PASSWORD: optional(z.string().max(1024)),

  // Comma-separated browser origins allowed in development; ignored in production (same origin).
  CORS_ORIGINS: z.preprocess(emptyToUndefined, z.string().max(2048).optional()),
});

/** An origin is scheme://host[:port] with nothing else; `*` is never accepted. */
function parseOrigins(raw: string | undefined): { origins: string[]; invalid: boolean } {
  if (!raw) return { origins: [], invalid: false };
  const origins: string[] = [];
  for (const part of raw.split(',')) {
    const value = part.trim();
    if (value === '') continue;
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      return { origins: [], invalid: true };
    }
    if (
      (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
      parsed.origin !== value.replace(/\/$/, '') ||
      value.endsWith('/')
    ) {
      return { origins: [], invalid: true };
    }
    origins.push(parsed.origin);
  }
  return { origins, invalid: false };
}

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
    loginMax: number;
    loginIpMax: number;
    loginAccountMax: number;
    forgotEmailMax: number;
    forgotIpMax: number;
    resetMax: number;
    refreshMax: number;
    passwordChangeMax: number;
    userWriteMax: number;
    userReadMax: number;
    globalIpMax: number;
    maxKeys: number;
  };
  mail: {
    transport: (typeof MAIL_TRANSPORTS)[number];
    from: string;
    smtp: {
      host: string;
      port: number;
      secure: boolean;
      user: string | undefined;
      password: string | undefined;
    };
  };
  cors: { origins: string[] };
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
  if (e.NODE_ENV === 'production') {
    // Reset links are built from this value, so it must be set explicitly and be https.
    const raw = typeof env.APP_BASE_URL === 'string' ? env.APP_BASE_URL.trim() : '';
    if (raw === '') {
      problems.push('APP_BASE_URL: is required in production');
    } else if (new URL(e.APP_BASE_URL).protocol !== 'https:') {
      problems.push('APP_BASE_URL: must use https in production');
    }
  }
  const mailTransport = e.MAIL_TRANSPORT ?? (e.NODE_ENV === 'test' ? 'memory' : 'smtp');
  if (e.NODE_ENV === 'production' && mailTransport !== 'smtp') {
    problems.push('MAIL_TRANSPORT: must be "smtp" in production');
  }
  const cors = parseOrigins(e.CORS_ORIGINS);
  if (cors.invalid) {
    problems.push(
      'CORS_ORIGINS: must be a comma-separated list of http(s) origins without paths or wildcards',
    );
  }
  if (problems.length > 0) throw new ConfigError(problems);

  const warnings: string[] = [];
  if (e.NODE_ENV === 'production' && cors.origins.length > 0) {
    warnings.push('CORS_ORIGINS is ignored in production (the SPA is served from the API origin)');
  }
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
      loginMax: e.RATE_LIMIT_LOGIN_MAX,
      loginIpMax: e.RATE_LIMIT_LOGIN_IP_MAX,
      loginAccountMax: e.RATE_LIMIT_LOGIN_ACCOUNT_MAX,
      forgotEmailMax: e.RATE_LIMIT_FORGOT_EMAIL_MAX,
      forgotIpMax: e.RATE_LIMIT_FORGOT_IP_MAX,
      resetMax: e.RATE_LIMIT_RESET_MAX,
      refreshMax: e.RATE_LIMIT_REFRESH_MAX,
      passwordChangeMax: e.RATE_LIMIT_PASSWORD_CHANGE_MAX,
      userWriteMax: e.RATE_LIMIT_USER_WRITE_MAX,
      userReadMax: e.RATE_LIMIT_USER_READ_MAX,
      globalIpMax: e.RATE_LIMIT_GLOBAL_IP_MAX,
      maxKeys: e.RATE_LIMIT_STORE_MAX_KEYS,
    },
    mail: {
      transport: mailTransport,
      from: e.MAIL_FROM,
      smtp: {
        host: e.SMTP_HOST,
        port: e.SMTP_PORT,
        secure: e.SMTP_SECURE,
        user: e.SMTP_USER,
        password: e.SMTP_PASSWORD,
      },
    },
    cors: { origins: e.NODE_ENV === 'production' ? [] : cors.origins },
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

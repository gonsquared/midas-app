import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig, loadMigrationConnection } from './config.js';

const base = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/midas',
  JWT_ACCESS_SECRET: 'x'.repeat(48),
};

describe('loadConfig', () => {
  it('applies defaults from a minimal environment', () => {
    const config = loadConfig(base);
    expect(config).toMatchObject({
      env: 'development',
      port: 3000,
      logLevel: 'info',
      trustProxy: 0,
      database: { poolMax: 10, ssl: 'off', migrationUrl: base.DATABASE_URL },
      auth: { accessTokenTtlSeconds: 600, refreshTokenTtlDays: 30, sessionAbsoluteTtlDays: 90 },
      rateLimit: { enabled: true, registerMax: 5, registerWindowSeconds: 3600 },
    });
  });

  it('treats empty strings (as in .env.example) as unset', () => {
    const config = loadConfig({ ...base, DATABASE_MIGRATION_URL: '', DATABASE_SSL: '', PORT: '' });
    expect(config.database.migrationUrl).toBe(base.DATABASE_URL);
    expect(config.port).toBe(3000);
  });

  it('defaults database TLS to verify-full in production', () => {
    const config = loadConfig({ ...base, NODE_ENV: 'production' });
    expect(config.database.ssl).toBe('verify-full');
  });

  it('fails fast and names the variable without echoing its value', () => {
    const secret = 'short-secret-value';
    let error: unknown;
    try {
      loadConfig({ ...base, JWT_ACCESS_SECRET: secret });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as ConfigError).message).toContain('JWT_ACCESS_SECRET');
    expect((error as ConfigError).message).not.toContain(secret);
  });

  it('requires DATABASE_URL', () => {
    expect(() => loadConfig({ JWT_ACCESS_SECRET: base.JWT_ACCESS_SECRET })).toThrow(/DATABASE_URL/);
  });

  it('rejects a non-postgres database URL and an out-of-range port', () => {
    expect(() => loadConfig({ ...base, DATABASE_URL: 'mysql://x' })).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ ...base, PORT: '70000' })).toThrow(/PORT/);
  });

  it('rejects the placeholder JWT secret in production', () => {
    expect(() =>
      loadConfig({
        ...base,
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'change-me-generate-a-long-random-value-0123456789',
      }),
    ).toThrow(/placeholder/);
  });

  it('rejects a JWT secret shorter than 43 characters', () => {
    expect(() => loadConfig({ ...base, JWT_ACCESS_SECRET: 'x'.repeat(42) })).toThrow(
      /JWT_ACCESS_SECRET/,
    );
    expect(
      loadConfig({ ...base, JWT_ACCESS_SECRET: 'x'.repeat(43) }).auth.jwtAccessSecret,
    ).toHaveLength(43);
  });

  it('rejects the placeholder JWT secret in development but allows it under NODE_ENV=test', () => {
    const placeholder = 'change-me-generate-a-long-random-value-and-more-chars';
    expect(() => loadConfig({ ...base, JWT_ACCESS_SECRET: placeholder })).toThrow(/placeholder/);
    expect(loadConfig({ ...base, NODE_ENV: 'test', JWT_ACCESS_SECRET: placeholder }).env).toBe(
      'test',
    );
  });

  it('rejects DATABASE_SSL=off in production but allows it elsewhere', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'production', DATABASE_SSL: 'off' })).toThrow(
      /DATABASE_SSL/,
    );
    expect(loadConfig({ ...base, DATABASE_SSL: 'off' }).database.ssl).toBe('off');
  });

  it('warns on DATABASE_SSL=require, and not on verify-full', () => {
    expect(loadConfig({ ...base, DATABASE_SSL: 'require' }).warnings.join()).toMatch(
      /DATABASE_SSL=require/,
    );
    expect(loadConfig({ ...base, DATABASE_SSL: 'verify-full' }).warnings).toEqual([]);
  });

  it('parses boolean flags', () => {
    expect(loadConfig({ ...base, RATE_LIMIT_ENABLED: 'false' }).rateLimit.enabled).toBe(false);
    expect(() => loadConfig({ ...base, RATE_LIMIT_ENABLED: 'maybe' })).toThrow(
      /RATE_LIMIT_ENABLED/,
    );
  });

  it('requires the absolute session lifetime to cover the refresh lifetime', () => {
    expect(() =>
      loadConfig({ ...base, REFRESH_TOKEN_TTL_DAYS: '60', SESSION_ABSOLUTE_TTL_DAYS: '30' }),
    ).toThrow(/SESSION_ABSOLUTE_TTL_DAYS/);
  });
});

describe('loadConfig validation edge cases', () => {
  it.each([
    ['non-numeric PORT', { PORT: 'abc' }, /PORT/],
    ['negative PORT', { PORT: '-1' }, /PORT/],
    ['unknown NODE_ENV', { NODE_ENV: 'staging-ish' }, /NODE_ENV/],
    ['unknown LOG_LEVEL', { LOG_LEVEL: 'loud' }, /LOG_LEVEL/],
    ['non-numeric pool size', { DATABASE_POOL_MAX: 'many' }, /DATABASE_POOL_MAX/],
  ])('fails fast on %s', (_n, patch, pattern) => {
    expect(() => loadConfig({ ...base, ...patch })).toThrow(pattern);
  });

  it('never echoes the database password in a validation error', () => {
    let message = '';
    try {
      loadConfig({ ...base, DATABASE_URL: 'mysql://user:s3cretpw@host/db' });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain('s3cretpw');
  });
});

describe('loadMigrationConnection', () => {
  it('prefers DATABASE_MIGRATION_URL and does not need auth secrets', () => {
    const connection = loadMigrationConnection({
      DATABASE_URL: 'postgres://app@localhost/midas',
      DATABASE_MIGRATION_URL: 'postgres://owner@localhost/midas',
    });
    expect(connection.connectionString).toBe('postgres://owner@localhost/midas');
    expect(connection.ssl).toBe(false);
  });

  it('disables the statement timeout for the migration connection', () => {
    const connection = loadMigrationConnection({ DATABASE_URL: 'postgres://app@localhost/midas' });
    expect(connection.options).toBe('-c statement_timeout=0');
  });

  it('fails when no database URL is set', () => {
    expect(() => loadMigrationConnection({})).toThrow(ConfigError);
  });
});

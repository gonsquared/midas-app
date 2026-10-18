import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';

const base = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/midas',
  JWT_ACCESS_SECRET: 'x'.repeat(48),
};
const PROD = {
  ...base,
  NODE_ENV: 'production',
  APP_BASE_URL: 'https://midas.example.com',
  MAIL_TRANSPORT: 'smtp',
};

describe('scheduler, metrics, audit and bootstrap settings', () => {
  it('defaults follow architecture 10', () => {
    const config = loadConfig(base);
    expect(config.scheduler).toEqual({
      enabled: true,
      intervalSeconds: 300,
      recurringMaxCatchup: 31,
      recurringMaxFailures: 5,
    });
    expect(config.metricsToken).toBeUndefined();
    expect(config.audit.hmacSecret).toBeUndefined();
    expect(config.bootstrapAdminEmail).toBeUndefined();
    expect(config.rateLimit.exportMax).toBe(10);
  });

  it('reads the scheduler variables and treats empty values as unset', () => {
    const config = loadConfig({
      ...base,
      SCHEDULER_ENABLED: 'false',
      SCHEDULER_INTERVAL_SECONDS: '60',
      RECURRING_MAX_CATCHUP: '10',
      RECURRING_MAX_FAILURES: '3',
      RATE_LIMIT_EXPORT_MAX: '4',
      METRICS_TOKEN: '',
      BOOTSTRAP_ADMIN_EMAIL: '',
    });
    expect(config.scheduler).toEqual({
      enabled: false,
      intervalSeconds: 60,
      recurringMaxCatchup: 10,
      recurringMaxFailures: 3,
    });
    expect(config.rateLimit.exportMax).toBe(4);
    expect(config.metricsToken).toBeUndefined();
    expect(config.bootstrapAdminEmail).toBeUndefined();
  });

  it.each([
    { SCHEDULER_INTERVAL_SECONDS: '0' },
    { SCHEDULER_INTERVAL_SECONDS: '86401' },
    { RECURRING_MAX_CATCHUP: '0' },
    { RECURRING_MAX_FAILURES: 'many' },
    { SCHEDULER_ENABLED: 'maybe' },
  ])('rejects %o', (env) => {
    expect(() => loadConfig({ ...base, ...env })).toThrow(ConfigError);
  });

  it('normalizes the bootstrap email and rejects a malformed one', () => {
    expect(
      loadConfig({ ...base, BOOTSTRAP_ADMIN_EMAIL: '  Root@Example.COM ' }).bootstrapAdminEmail,
    ).toBe('root@example.com');
    expect(() => loadConfig({ ...base, BOOTSTRAP_ADMIN_EMAIL: 'not-an-email' })).toThrow(
      ConfigError,
    );
  });

  it('requires strong, well-formed secrets and never echoes them', () => {
    const weak = 'short-token';
    let error: unknown;
    try {
      loadConfig({ ...base, METRICS_TOKEN: weak });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as ConfigError).message).toContain('METRICS_TOKEN');
    expect((error as ConfigError).message).not.toContain(weak);
    expect(() => loadConfig({ ...base, METRICS_TOKEN: `${'a'.repeat(32)} space` })).toThrow(
      ConfigError,
    );
    expect(() => loadConfig({ ...base, AUDIT_HMAC_SECRET: 'tiny' })).toThrow(ConfigError);
    expect(loadConfig({ ...base, METRICS_TOKEN: 'a1b2c3d4'.repeat(8) }).metricsToken).toHaveLength(
      64,
    );
  });

  it('rejects placeholder secrets outside test, as for the JWT secret', () => {
    const placeholder = 'change-me-generate-a-long-random-value';
    expect(() => loadConfig({ ...base, METRICS_TOKEN: placeholder })).toThrow(/METRICS_TOKEN/);
    expect(() => loadConfig({ ...base, AUDIT_HMAC_SECRET: placeholder })).toThrow(
      /AUDIT_HMAC_SECRET/,
    );
    expect(
      loadConfig({ ...base, NODE_ENV: 'test', AUDIT_HMAC_SECRET: placeholder }).audit.hmacSecret,
    ).toBe(placeholder);
  });

  it('warns, but still starts, in production without AUDIT_HMAC_SECRET', () => {
    expect(loadConfig(PROD).warnings.join(' ')).toContain('AUDIT_HMAC_SECRET');
    const quiet = loadConfig({ ...PROD, AUDIT_HMAC_SECRET: 'h'.repeat(40) });
    expect(quiet.warnings.join(' ')).not.toContain('AUDIT_HMAC_SECRET');
  });
});

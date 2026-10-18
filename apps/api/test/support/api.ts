import type { AuthSession } from '@midas/shared';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import type pg from 'pg';
import { buildApp } from '../../src/app.js';
import { BackgroundTasks } from '../../src/platform/background.js';
import type { DatabaseClient } from '../../src/platform/db/client.js';
import { MemoryMailer } from '../../src/platform/mailer/mailer.js';
import { testConfig } from './app.js';
import { appClient, ownerPool } from './db.js';

export const APP_ORIGIN = 'http://localhost:5173';
export const STRONG_PASSWORD = 'correct horse battery staple 42';

/** A clock tests can move forward; the app, tokens and session expiry all read it. */
export class TestClock {
  private current: Date;
  constructor(start = new Date()) {
    this.current = start;
  }
  now = () => new Date(this.current);
  advance(ms: number) {
    this.current = new Date(this.current.getTime() + ms);
  }
  set(date: Date) {
    this.current = date;
  }
}

export interface IntegrationContext {
  app: FastifyInstance;
  client: DatabaseClient;
  owner: pg.Pool;
  mailer: MemoryMailer;
  background: BackgroundTasks;
  clock: TestClock;
  close(): Promise<void>;
}

/** App on the real database through the midas_app role, with rate limits off by default. */
export async function createIntegrationContext(
  env: Record<string, string> = {},
): Promise<IntegrationContext> {
  const owner = ownerPool();
  const client = appClient();
  const mailer = new MemoryMailer();
  const background = new BackgroundTasks(() => undefined);
  const clock = new TestClock();
  const app = await buildApp({
    config: testConfig({ RATE_LIMIT_ENABLED: 'false', APP_BASE_URL: APP_ORIGIN, ...env }),
    db: client.db,
    clock,
    mailer,
    background,
  });
  return {
    app,
    client,
    owner,
    mailer,
    background,
    clock,
    async close() {
      await app.close();
      await client.db.destroy();
      await owner.end();
    },
  };
}

export interface TestUser {
  id: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  headers: { authorization: string };
}

export function cookieValue(response: LightMyRequestResponse, name = 'midas_rt'): string {
  const raw = [response.headers['set-cookie']].flat().join(';');
  const match = new RegExp(`${name}=([^;]*)`).exec(raw);
  if (!match) throw new Error('cookie not set');
  return match[1] ?? '';
}

let counter = 0;
export async function registerUser(
  app: FastifyInstance,
  overrides: Record<string, unknown> = {},
): Promise<TestUser> {
  counter += 1;
  const email = `user${counter}-${Date.now()}@example.com`;
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      email,
      password: STRONG_PASSWORD,
      displayName: `User ${counter}`,
      ...overrides,
    },
  });
  if (response.statusCode !== 201) throw new Error(`register failed: ${response.body}`);
  const session = response.json<AuthSession>();
  return {
    id: session.user.id,
    email: session.user.email,
    accessToken: session.accessToken,
    refreshToken: cookieValue(response),
    headers: { authorization: `Bearer ${session.accessToken}` },
  };
}

export function refreshHeaders(token: string) {
  return {
    cookie: `midas_rt=${token}`,
    origin: APP_ORIGIN,
    'x-csrf-protection': '1',
  };
}

/**
 * Promotes a user to admin directly in the database (owner connection). The role is read from the
 * database on every request, so the user's existing access token becomes an admin token.
 */
export async function makeAdmin(owner: pg.Pool, userId: string): Promise<void> {
  await owner.query(`update users set role = 'admin' where id = $1`, [userId]);
}

/** Registers a user and promotes it to admin. */
export async function registerAdmin(
  app: FastifyInstance,
  owner: pg.Pool,
  overrides: Record<string, unknown> = {},
): Promise<TestUser> {
  const user = await registerUser(app, overrides);
  await makeAdmin(owner, user.id);
  return user;
}

export interface AuditRow {
  action: string;
  actor_user_id: string | null;
  target_type: string;
  target_id: string | null;
  ip: string | null;
  user_agent: string | null;
  request_id: string | null;
  metadata: Record<string, unknown>;
}

/** Audit rows (oldest first) for assertions, optionally limited to some actions. */
export async function auditRows(owner: pg.Pool, actions?: string[]): Promise<AuditRow[]> {
  const result = actions
    ? await owner.query(
        `select action, actor_user_id, target_type, target_id, host(ip) as ip, user_agent,
                request_id, metadata
           from audit_logs where action = any($1) order by occurred_at, id`,
        [actions],
      )
    : await owner.query(
        `select action, actor_user_id, target_type, target_id, host(ip) as ip, user_agent,
                request_id, metadata
           from audit_logs order by occurred_at, id`,
      );
  return result.rows as AuditRow[];
}

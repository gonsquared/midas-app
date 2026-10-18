import type { PlatformMetrics } from '@midas/shared';
import { sql, type Kysely } from 'kysely';
import type { Clock } from '../../platform/clock.js';
import type { Database } from '../../platform/db/database.js';

/** How long a computed snapshot is reused (api-contract 15). */
export const METRICS_CACHE_TTL_MS = 5 * 60_000;
const THIRTY_DAYS_MS = 30 * 86_400_000;

/**
 * Platform-wide counts only (ADR-018): no email, name, wallet name, amount or per-user figure
 * leaves this class. The snapshot is cached in process for five minutes, and concurrent callers
 * share one in-flight computation so a burst of admin requests runs the counts once (AP-15).
 */
export class PlatformMetricsService {
  private cached: { value: PlatformMetrics; expiresAt: number } | undefined;
  private inFlight: Promise<PlatformMetrics> | undefined;

  constructor(private readonly deps: { db: Kysely<Database>; clock: Clock; ttlMs?: number }) {}

  async get(): Promise<PlatformMetrics> {
    const now = this.deps.clock.now().getTime();
    if (this.cached && this.cached.expiresAt > now) return this.cached.value;
    this.inFlight ??= this.compute().finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  private async compute(): Promise<PlatformMetrics> {
    const now = this.deps.clock.now();
    const since = new Date(now.getTime() - THIRTY_DAYS_MS);
    const { db } = this.deps;
    const [users, wallets, transactions, templates] = await Promise.all([
      db
        .selectFrom('users')
        .select([
          sql<number>`count(*)::bigint`.as('total'),
          sql<number>`(count(*) filter (where last_login_at >= ${since}))::bigint`.as('active30d'),
          sql<number>`(count(*) filter (where created_at >= ${since}))::bigint`.as('new30d'),
          sql<number>`(count(*) filter (where status = 'suspended'))::bigint`.as('suspended'),
          sql<number>`(count(*) filter (where role = 'admin'))::bigint`.as('admins'),
        ])
        .executeTakeFirstOrThrow(),
      db
        .selectFrom('wallets')
        .select([
          sql<number>`count(*)::bigint`.as('total'),
          sql<number>`(count(*) filter (where archived_at is null))::bigint`.as('active'),
        ])
        .executeTakeFirstOrThrow(),
      db
        .selectFrom('transactions')
        .select([
          sql<number>`count(*)::bigint`.as('total'),
          sql<number>`(count(*) filter (where created_at >= ${since}))::bigint`.as('last30d'),
        ])
        .executeTakeFirstOrThrow(),
      db
        .selectFrom('recurringTemplates')
        .select(sql<number>`count(*)::bigint`.as('active'))
        .where('status', '=', 'active')
        .executeTakeFirstOrThrow(),
    ]);
    const value: PlatformMetrics = {
      generatedAt: now.toISOString(),
      users,
      wallets,
      transactions,
      recurringTemplates: templates,
    };
    this.cached = { value, expiresAt: now.getTime() + (this.deps.ttlMs ?? METRICS_CACHE_TTL_MS) };
    return value;
  }
}

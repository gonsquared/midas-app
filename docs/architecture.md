# Midas Architecture

**Status:** Accepted (baseline v1)
**Owner:** software-architect-agent
**Last updated:** 2026-10-16
**Related:** [API contract](./api-contract.md) · [Project brief](./project-brief.md)

This document defines the technical direction for Midas, a personal finance web application. It is the reference for all implementation work. The decision log in §14 records each significant choice, its trade-offs and the alternatives that were rejected.

---

## 1. Project understanding

Midas lets people record income, expenses and transfers across multiple wallets, organize them by category, plan spending with budgets, automate regular items with recurring templates, and understand their finances through a dashboard and reports. Operators manage the platform through an admin area that deliberately has no access to users' private financial records.

**Primary user flows**

1. Visitor registers, is signed in, and lands on an empty dashboard with default categories available.
2. User creates wallets (cash, bank, card, savings), each in one currency, with an opening balance.
3. User records income and expenses, transfers between wallets, searches, filters and exports transactions.
4. User sets monthly (default), weekly or yearly budgets, overall or per category, and sees progress and warnings.
5. User sets up recurring templates that automatically generate transactions.
6. User reviews dashboard: balances, period income vs expense, trends, category breakdown, budget status.
7. User manages profile, password, currency, locale, timezone and theme. User recovers access via an emailed reset link.
8. Admin manages users (search, suspend, reactivate, role change) and system categories, views platform metrics and the audit log.

**Quality attributes, in priority order**

1. Correctness of money: integer arithmetic, atomic multi-row changes, no lost or duplicated generated transactions.
2. Security and privacy: OWASP ASVS L1-level hygiene, strict tenant isolation, an admin privacy boundary, and no secrets in the repository.
3. Accessibility: WCAG 2.1 AA.
4. Maintainability and clarity: a public, reference-quality codebase.
5. Simple operations: one container plus one database, a one-click-style deploy, Docker for local development.
6. Performance: snappy at personal-finance scale. Targets are in §11.

**Scale assumptions (v1):** up to about 50k registered users, a few hundred concurrent, about 10k transactions per active user per year. Performance is verified with 100k transactions for a single user.

---

## 2. Recommended architecture

### 2.1 Style: modular monolith, single deployable

One TypeScript backend process (`apps/api`) contains all domain modules and also serves the compiled React single-page app (`apps/web`) from the same origin. A background scheduler runs inside the API process by default and can be moved to a separate worker process from the same image with an environment flag.

```
                  Browser (React SPA, CSR)
                         │  HTTPS, same origin
                         ▼
 ┌──────────────────────────────────────────────────────────┐
 │  Midas container (Node.js 24, Fastify 5)                 │
 │                                                          │
 │  /assets/*, /*  -> static SPA (index.html fallback)      │
 │  /api/v1/*      -> REST API (JSON, Problem Details)      │
 │  /health        -> liveness + DB readiness               │
 │  /metrics       -> Prometheus (token-protected)          │
 │                                                          │
 │  Modules: auth · users · wallets · categories ·          │
 │  transactions · transfers · budgets · reports ·          │
 │  recurring · admin · audit                               │
 │  Platform: config · db · mailer · clock · scheduler ·    │
 │  rate-limit · logging · metrics · errors                 │
 └──────────────┬──────────────────────────┬────────────────┘
                │ SQL (ACID)               │ SMTP
                ▼                          ▼
     Relational database          Mail provider (prod) /
     (engine: db-agent)           Mailpit (local dev)
```

### 2.2 Backend layering (per module)

```
routes.ts      HTTP binding: Zod-validated input/output, auth guard, status codes
service.ts     Business rules, ownership checks, DB transactions, audit emission
repository.ts  Data access only (ORM/query builder chosen by db-agent)
*.test.ts      Unit tests (service with fakes) + integration tests (routes against real DB)
```

Rules:

- Routes never touch the database directly. Services never touch HTTP objects.
- Every user-data query is scoped by the authenticated `userId`. Admin role does not bypass ownership scoping.
- Cross-module calls go through service interfaces, never through another module's repository.
- Time comes from an injected `Clock`, and email goes through an injected `Mailer`, so tests can control both.
- Money arithmetic lives only in `packages/shared/money` and is exhaustively unit tested.

### 2.3 Shared contract package

`packages/shared` holds Zod schemas for every request and response in the API contract, plus enums, the supported currency and locale lists, the icon and color token allowlists, money helpers, recurrence date math and budget-state math. The backend uses these schemas for validation and OpenAPI generation. The frontend uses them for typed API calls and form validation. `docs/api-contract.md` is the human-readable authority, and the shared schemas implement it.

### 2.4 Domain policies (resolved ambiguities)

**Multi-currency (ADR-008)**

- Each wallet has exactly one currency (ISO 4217, from the supported list). The currency can change only while the wallet has no transactions and no recurring templates.
- A transaction's currency is always its wallet's currency. No FX rates are stored or fetched in v1.
- Transfers between wallets with different currencies are allowed only when the client provides `toAmountMinor` explicitly, which is the destination amount; the rate is implied. For wallets with the same currency, `toAmountMinor` is optional and must equal `amountMinor` if sent.
- The user's preference `currency` is a default only. It pre-fills new wallets and budgets and is the default currency for reports. Changing it never converts data.
- Dashboard totals are returned per currency. Trend and category reports take a single `currency` parameter, defaulting to the preference. Budgets have a currency and count only expenses from wallets in that currency.

**Money representation (ADR-009)**

- Amounts are integers in minor units (`amountMinor`), with the exponent given by the currency (for example JPY 0, USD 2, KWD 3).
- Transaction amounts are always positive, and the direction comes from the type. Balances and opening balances are signed.
- The absolute value of any amount is at most 10^14 minor units, so values stay well inside JSON's safe integer range.
- Formatting happens only at the edges: `Intl.NumberFormat` in the UI with the user's locale, and decimal major units in CSV.

**Time and dates (ADR-017)**

- Ledger dates (`occurredOn`, budget periods, recurrence dates) are calendar dates (`YYYY-MM-DD`) with no time component.
- Each user has an IANA `timezone` preference. It defaults to the browser value at registration, falling back to `UTC`. It is used only to compute "today" for default ranges, budget periods and recurring due dates.
- System timestamps are UTC ISO 8601.

**Budgets (ADR-012)**

- Periods: `monthly` (default), `weekly` (ISO weeks, starting Monday), `yearly`. All are calendar-aligned. `startDate` is normalized to the start of its period, and the budget applies to every period from then on.
- Scope is either `overall` (all expense transactions in the budget currency) or `category` (expense categories only).
- Spent is the sum of expense transactions in the period, in the budget's currency, for the scope. Transfers and income are excluded. Transactions in archived wallets still count, because they are real spending. Retired categories still count. Deleted transactions do not count.
- `warningThresholdPct` defaults to 80, is configurable per budget, and must be an integer from 1 to 99.
- States are computed with integer math, never floats:
  - `ok` when `spent*100 < limit*threshold`
  - `warning` when `spent*100 >= limit*threshold` and `spent < limit`
  - `exceeded` when `spent >= limit`
- Limit edits apply to all periods, past and future. Limit history is not kept in v1.
- One budget per (user, scope or category, period, currency).

**Recurring transactions (ADR-011)**

- Templates cover `income` and `expense` (recurring transfers are deferred). Frequencies are `daily`, `weekly`, `monthly` and `yearly`, each with `interval` 1 to 99, plus `startDate` and an optional `endDate`.
- Monthly and yearly occurrences are anchored to the start date. If the anchor day does not exist in a month, the occurrence moves to the month's last day (for example 31 Jan, 28 or 29 Feb, 31 Mar).
- `startDate` may be at most 31 days in the past. Past occurrences are generated on the next tick.
- A template is due when `nextRunOn` is on or before "today" in the owner's timezone.
- **Catch-up policy:** every missed occurrence up to today is generated, each dated on its own occurrence date. At most `RECURRING_MAX_CATCHUP` (default 31) are generated per template per tick, and the rest continue on later ticks.
- **Pause and resume:** occurrences during a pause are not backfilled. Resume sets `nextRunOn` to the first occurrence on or after today.
- **Schedule edits** change only future occurrences. `nextRunOn` is recomputed as the first occurrence on or after today.
- **Archived wallets:** archiving a wallet pauses its active templates. A run that finds an archived wallet or retired category records `skipped` and pauses the template.
- **Failures:** a run is recorded as `failed` with an error code and retried on the next tick. After 5 consecutive failures the template is paused, `lastError` is set, and an error-level log is emitted.
- Generated transactions are ordinary transactions linked by `recurringTemplateId`. Deleting one does not cause it to be regenerated, because run history is unique per (template, occurrence date). Deleting a template keeps the transactions it generated and clears their link.

**Category deletion**

- System categories are read-only to users. Admins retire them; they are never hard-deleted. A retired category stays on existing transactions but cannot be chosen for new transactions, templates or budgets.
- A user category that is in use (referenced by transactions or recurring templates) can be deleted only with `reassignTo`, an accessible, non-retired category of the same type. Budgets scoped to the deleted category are deleted, and the count is returned.

**Wallet archive and delete**

- Archived wallets are hidden by default and are read-only: no new, edited or deleted transactions, transfers or templates touching them, and no wallet edits other than unarchive.
- A wallet can be hard-deleted only when it has no transactions and no recurring templates.

**Admin privacy boundary (ADR-018)**

- No admin endpoint reads, aggregates per user, or exports transactions, wallets, budgets or templates of other users.
- Admin metrics are platform-wide aggregates only.
- The audit log never stores passwords, tokens, amounts, notes or other transaction details.

### 2.5 Cross-cutting

- **Validation:** strict Zod schemas on every route. Unknown fields are rejected, and the same schemas power client-side forms.
- **Errors:** RFC 9457 Problem Details with stable machine `code`s and a `requestId`.
- **Logging:** pino JSON logs with `requestId`. Authorization headers, cookies, passwords, tokens and request bodies on auth routes are redacted.
- **Observability:** `/health` (liveness and DB readiness) and `/metrics` (Prometheus: HTTP latency histograms, error counts, scheduler run counters, DB pool gauges). A runbook lives in `docs/operations/`.
- **Rate limiting:** `@fastify/rate-limit`. The in-memory store is fine for a single instance, and the store is pluggable if the app scales out (see §12).
- **Security headers:** `@fastify/helmet` with a strict CSP (§9).

---

## 3. Backend stack decision

**Decision:** TypeScript on Node.js 24 LTS with Fastify 5, Zod 4 and `fastify-type-provider-zod` (OpenAPI generated via `@fastify/swagger`).

### Language comparison

| Criterion | TypeScript (selected) | Python | Go |
| --- | --- | --- | --- |
| Team familiarity / fullstack fit | One language across API, web and shared contract | Second language beside React | Second language, smaller web-app talent pool |
| Ecosystem fit | Mature auth, validation, mail and OpenAPI libraries | Excellent (FastAPI, Pydantic) | Good but more hand-rolled |
| API complexity (CRUD, reports, auth) | Well suited | Well suited | Well suited, more boilerplate |
| Performance needs | Ample for this scale | Ample | Exceeds needs |
| Async / background processing | Event loop and timers are enough for an in-process scheduler | asyncio or Celery (extra infra) | Goroutines (excellent, not needed) |
| AI / data-processing needs | None in scope | Main advantage, unused here | None |
| Maintainability | Types are shared end to end through `packages/shared` | Types are duplicated across the language boundary | Types are duplicated across the language boundary |
| Deployment complexity | One image serves API and SPA | Two toolchains in CI and Docker | Two toolchains |

Python's strengths (ML and data science) are outside v1 scope. Go was not chosen: there is no high-concurrency or low-latency requirement that would justify a second language, and sharing types with the frontend matters more.

### Framework comparison (TypeScript)

| Criterion | Fastify 5 (selected) | NestJS | Express 5 | Hono |
| --- | --- | --- | --- | --- |
| Schema-first validation and OpenAPI | Native (type providers, swagger) | Decorators and class-validator | Bolt-on | Good (zod-openapi) |
| Official plugins (helmet, cors, cookie, rate-limit, static) | First-party | Via Express/Fastify adapters | Community | Partial |
| Testability | `app.inject()` with no network | Good, heavier DI | supertest | Good |
| Boilerplate and learning curve | Low | High (modules, DI, decorators) | Low, but few conventions | Low |
| Performance | High | Medium | Medium | High |

---

## 4. Frontend framework decision

**Decision:** React 19 with Vite, TanStack Router (typed routes and typed URL search params), TanStack Query (server state), React Hook Form with Zod resolvers using the shared schemas, Tailwind CSS v4 with design tokens, Radix UI primitives (owned, shadcn-style components), Recharts, and lucide icons limited to an allowlist.

React is the default and nothing argues against it. Vue and Svelte were not considered necessary: there is no bundle-size hard limit and no team preference that would justify leaving React's accessibility-primitive and charting ecosystem.

| Option | SEO need | Server runtime | Fit for this app | Verdict |
| --- | --- | --- | --- | --- |
| Vite + React SPA | Not needed (app is behind login) | None (static files served by the API) | Simplest; same-origin cookies; fast dev server | Selected |
| Next.js (App Router, RSC) | Strong | Node server | Duplicates the API/BFF layer, complicates token and cookie handling across two servers, RSC adds complexity with little benefit behind login | Rejected |
| React Router v7 framework mode | Good | Optional | Good, but SSR is unnecessary and typed search params are weaker than TanStack Router's for filter-heavy screens | Rejected |
| Plain React (no router or bundler choice) | n/a | n/a | No justification | Rejected |

TanStack Router's validated, typed search params are a direct fit for stories that keep filters and date ranges in the URL (E5-F2-S4, E7-F2-S4).

---

## 5. Rendering strategy decision

**Decision:** CSR for the whole application. The API serves the built SPA from the same origin with `index.html` fallback. Public pages (sign-in, register, forgot or reset password) are part of the SPA and carry static meta tags and `noindex` where appropriate.

| Factor | Assessment |
| --- | --- |
| SEO | Not required: all valuable content is private. The landing page is minimal and needs only static meta tags. |
| Auth | Nearly every screen needs authentication. CSR plus an in-memory access token avoids server-side session plumbing. |
| Personalization | Total. Every view is user-specific, so SSR or SSG caching gains nothing. |
| Data freshness | Live. TanStack Query handles caching and invalidation after mutations. |
| Performance | Route-level code splitting, lazy-loaded charts and password-strength checker. Target LCP under 2.5 s on mid-range mobile. |
| Caching | Hashed static assets: `Cache-Control: public, max-age=31536000, immutable`. `index.html`: `no-cache`. API responses: `no-store`. |
| Deployment | Static output bundled into the API image, so there is no separate frontend host and no CORS in production. |
| Complexity | Lowest of the options. |

Rejected: SSR (adds a server runtime and no SEO benefit), SSG or ISR (content is private), RSC (see §4), and hybrid (unneeded). A future public marketing site could be a separate static site without affecting the app.

---

## 6. Package manager / runtime decision

**Decision:** pnpm workspaces (pnpm 10.x, pinned via `packageManager`, enabled through Corepack) with Node.js 24 LTS as the runtime everywhere: local, CI and production.

No lockfile exists yet. Midas is a multi-package workspace (`apps/api`, `apps/web`, `packages/shared`, `tooling/*`, `e2e`), and the backend relies on native-binary dependencies such as argon2. Under the decision priority, pnpm is preferred for workspaces that need strict dependency isolation and conservative CI. Bun would be reasonable for a single-package app, but using it only as an installer while running Node gives most of the speed benefit with more variables, and using it as the runtime adds compatibility risk for the API's native modules and Node-specific tooling.

| Use case | Prefer Bun | Prefer pnpm | Midas |
| --- | --- | --- | --- |
| New single-package app | Yes | Maybe | Not applicable (workspace) |
| Next.js or Vite app | Yes, if compatible | Yes | Vite works with both |
| Node/TypeScript API | Yes, if runtime compatible | Yes, if Node-only stability is required | Node runtime chosen for stability |
| Monorepo/workspaces | Maybe, if simple | Yes | pnpm |
| Existing lockfile | n/a | n/a | None |
| Fast installs/scripts | Yes | Yes | Both fast enough |
| Strict dependency isolation | Maybe | Yes | Wanted (no phantom dependencies across apps) |
| Lowest migration risk | Maybe | Yes | pnpm |
| All-in-one runtime/test/bundler | Yes | No | Not needed (Vite and Vitest chosen) |
| Conservative CI | Maybe | Usually yes | pnpm |

**Lockfile to commit:** `pnpm-lock.yaml`, plus `pnpm-workspace.yaml` and the root `package.json` `packageManager` field. Do not commit `package-lock.json`, `yarn.lock` or `bun.lock`.

**Key commands**

```bash
corepack enable                      # once per machine
pnpm install                         # install all workspaces
pnpm dev                             # api + web in parallel (turbo-free; uses pnpm -r --parallel)
pnpm --filter @midas/api dev         # api only (tsx watch)
pnpm --filter @midas/web dev         # web only (vite)
pnpm lint && pnpm typecheck          # eslint flat config + tsc --noEmit across workspaces
pnpm test                            # vitest unit tests, all workspaces
pnpm test:integration                # api integration tests (Testcontainers DB)
pnpm test:e2e                        # playwright against docker compose stack
pnpm build                           # shared -> web -> api
pnpm --filter @midas/api cli migrate # run migrations (tool chosen by db-agent)
pnpm --filter @midas/api cli admin:create --email you@example.com
```

**CI and Docker implications**

- CI uses `pnpm/action-setup` and `actions/setup-node` with `cache: pnpm`, then `pnpm install --frozen-lockfile`.
- The Dockerfile is multi-stage on `node:24-slim`:
  - run `corepack enable`
  - `pnpm fetch`, then `pnpm install --offline --frozen-lockfile`
  - build
  - `pnpm deploy --filter @midas/api --prod /out` for a pruned runtime
  - the final stage runs as a non-root user.
- Root `.npmrc`: `engine-strict=true`, `auto-install-peers=true`. Peer dependencies stay strict, with no hoisting overrides unless documented.

**Migration notes:** none (greenfield).

---

## 7. API contract

The authoritative contract is **[docs/api-contract.md](./api-contract.md)**. It is read-only for implementation agents. Summary of conventions:

- REST and JSON under `/api/v1`. Ops endpoints `/health` and `/metrics` are at the root.
- Bearer access token for authenticated endpoints. The refresh token is an httpOnly cookie scoped to `/api/v1/auth`.
- IDs are UUID strings. Money is integer `amountMinor` plus a `currency`. Dates are `YYYY-MM-DD`, timestamps are UTC ISO 8601.
- Errors use RFC 9457 Problem Details (`application/problem+json`) with stable `code` values.
- Pagination: opaque cursors for transactions, audit log and recurring runs; page numbers for admin users. Bounded lists (wallets, categories, budgets, templates) are unpaginated, with per-user limits.
- Resources owned by another user return 404, never 403, so their existence is not revealed.
- The OpenAPI 3.1 document is generated from `packages/shared` schemas, served at `/api/v1/openapi.json` in non-production environments, and published under `docs/api/` in CI. A contract test fails the build if the generated document drifts from the endpoint list in `api-contract.md`.

---

## 8. Database/storage requirements and db-agent handoff

The database engine, ORM or query builder, schema, indexes and migration tooling are owned by db-agent. This section states requirements only.

**Working assumption until db-agent confirms:** PostgreSQL 17, used only so Docker Compose and CI can be sketched. This is not a final decision (ADR-016).

### 8.1 Required capabilities

- ACID transactions across multiple rows and tables, at least READ COMMITTED, with row-level locking.
- A way to claim work concurrently without double processing (for example `SELECT … FOR UPDATE SKIP LOCKED` or advisory locks).
- Unique constraints, including partial or conditional uniqueness (one budget per scope, case-insensitive names) and check constraints.
- 64-bit integers for money, a native date type for ledger dates, and UTC timestamps.
- Semi-structured column for audit `metadata`.
- Efficient case-insensitive substring search on transaction notes and admin user email or name.
- Up and down migrations. Seeds kept separate from migrations: idempotent system-category seed, a dev demo seed, and a perf seed with 100k transactions.
- TypeScript type-safe access, with an escape hatch to raw SQL for report aggregations and keyset pagination. Runs on Node 24 in Docker.
- Managed offerings on common container hosts, with automated backups and point-in-time recovery.

### 8.2 Entities (logical; the physical design is db-agent's)

| Entity | Key attributes | Notes |
| --- | --- | --- |
| User | id, email (case-insensitive unique), passwordHash, displayName, role (`user`/`admin`), status (`active`/`suspended`), suspendedAt, suspendedReason, currency, locale, timezone, theme, lastLoginAt, createdAt, updatedAt | No account deletion in v1 |
| Session | id, userId, currentRefreshTokenHash, previousRefreshTokenHash, rotatedAt, createdAt, lastUsedAt, expiresAt (absolute), revokedAt, revokedReason, userAgent, ip | One row per sign-in. Refresh rotation replaces the hash in place. |
| PasswordResetToken | id, userId, tokenHash (unique), expiresAt, usedAt, createdAt | Issuing a new token invalidates earlier unused ones |
| Wallet | id, userId, name (unique per user, case-insensitive), type, currency, openingBalanceMinor (signed), archivedAt, createdAt, updatedAt | Limit of 100 per user |
| Category | id, ownerUserId (null for system), name, type (`income`/`expense`), icon, color, retiredAt (system only), createdAt, updatedAt | Unique (owner, type, lower(name)). Limit of 200 user categories per user. |
| Transaction | id, userId, walletId, type (`income`/`expense`/`transfer`), categoryId (null if and only if transfer), amountMinor (> 0), currency (copy of wallet currency), occurredOn (date), note (≤ 500), transferId, transferDirection (`out`/`in`), recurringTemplateId, createdAt, updatedAt | Transfers are two legs that share a transferId |
| Transfer (or an equivalent grouping) | id, userId, outTransactionId, inTransactionId | db-agent may model this as a table or a self-reference. Both legs are required, or neither. |
| Budget | id, userId, scope, categoryId (null if and only if overall), period, amountMinor, currency, warningThresholdPct, startDate, createdAt, updatedAt | Unique (user, coalesce(categoryId), period, currency). Limit of 200. |
| RecurringTemplate | id, userId, name, type, walletId, categoryId, amountMinor, note, frequency, interval, anchorDay (derived), startDate, endDate, nextRunOn, status (`active`/`paused`/`ended`), consecutiveFailures, lastRunAt, lastError, createdAt, updatedAt | Limit of 200 |
| RecurringRun | id, templateId, occurrenceDate, status (`succeeded`/`failed`/`skipped`), transactionId, errorCode, attempts, createdAt, updatedAt | **Unique (templateId, occurrenceDate)**, which is the idempotency key |
| AuditLog | id, occurredAt, actorUserId (nullable), action, targetType, targetId, ip, userAgent, requestId, metadata | Append-only. No update or delete path for the application's database role. |

### 8.3 Access patterns

| ID | Pattern | Frequency | Target |
| --- | --- | --- | --- |
| AP-01 | User lookup by normalized email (login, register, forgot) | Medium | p95 < 10 ms |
| AP-02 | Per-request auth check: session by id (not revoked, not expired) joined to user role and status | Every authenticated request (hot path) | p95 < 5 ms |
| AP-03 | Session by refresh-token hash (current or previous), then compare-and-swap rotation | Every ~10 min per active tab | p95 < 10 ms |
| AP-04 | Reset token by hash; invalidate a user's outstanding tokens | Low | — |
| AP-05 | List a user's wallets with current balance (opening + Σ income − Σ expense − Σ transfer out + Σ transfer in) | Very high (dashboard, forms) | p95 < 50 ms at 100k tx/user |
| AP-06 | List system and own categories by type, optionally including retired | High (cacheable client-side) | — |
| AP-07 | Transaction list: by user + date range + wallets[] + categories[] + types[] + amount range + note substring; sorts date desc/asc, amount desc/asc; keyset pagination (tiebreaker id) | Very high | p95 < 200 ms at 100k tx/user, verified with EXPLAIN |
| AP-08 | Export: same filters as AP-07, streamed with a server-side cursor | Low | Constant memory |
| AP-09 | Aggregations per user and currency over a date range: totals by type; totals by category; totals by day/week/month bucket; budget spent per category or overall per period | High (dashboard) | p95 < 300 ms at 100k tx/user |
| AP-10 | Scheduler: claim due templates (`status=active AND nextRunOn <= :bound`) ordered by nextRunOn, batch of 100, skip locked | Every 5 min | Must not double-process |
| AP-11 | Insert a run guarded by unique (templateId, occurrenceDate) | Per occurrence | — |
| AP-12 | Category in-use check; bulk reassign of transactions and templates; delete category budgets | Low | Atomic |
| AP-13 | Admin user search: email/name substring, role/status filters, sort, offset with total count | Low | p95 < 200 ms at 50k users |
| AP-14 | Audit query: time desc, filter by actor, action(s), target, date range; keyset pagination | Low | p95 < 200 ms at 5M rows |
| AP-15 | Platform metrics counts (users by status/role, active in 30 days, wallets, transactions in total and in 30 days, active templates) | Low (cached 5 min) | < 2 s uncached |
| AP-16 | Count active admins under lock (last-admin protection) | Rare | Serialized |
| AP-17 | Housekeeping: delete expired or revoked sessions older than 30 days and used or expired reset tokens | Daily | — |
| AP-18 | Check whether a wallet has transactions or templates (currency lock, delete eligibility) | Medium | p95 < 10 ms |

### 8.4 Consistency requirements

- **C-01:** Both transfer legs are created, updated and deleted in one transaction.
- **C-02:** Any transaction write and its balance effect must be visible together. Whether balances are computed on read or stored and maintained is db-agent's choice. Either way, reads after a committed write return the new balance (single primary, no read replicas in v1).
- **C-03:** Recurring generation commits the run row, the transaction and the template's `nextRunOn`, `lastRunAt` and failure counters together, one occurrence per transaction. The unique run key is the final safeguard against duplicates when instances run concurrently.
- **C-04:** Refresh rotation is an atomic compare-and-swap on the session row. Two concurrent refreshes with the same token must not both succeed beyond the grace rule in §9.
- **C-05:** Category reassign-and-delete is atomic.
- **C-06:** Last-admin and self-protection checks plus the role or status update are serialized, for example by locking the admin set.
- **C-07:** An admin action and its audit row are written in the same transaction. Auth-event audit rows, such as failed logins, are written independently and are best-effort, with failures logged.
- **C-08:** Suspension and password reset revoke all of the user's sessions in the same transaction as the status or password change.
- **C-09:** Foreign keys restrict deleting wallets and categories that are referenced. Deleting a template clears `recurringTemplateId` on its transactions.
- **C-10:** Audit rows can never be updated or deleted through the application's database role. Retention purges, if introduced, run as a separate privileged maintenance task.

### 8.5 Other storage needs

- **Cache:** none required in v1. Metrics are cached in process. Rate-limit counters live in memory on a single instance. If the app scales horizontally, a shared store is needed for rate limits; db-agent should advise between a database-backed store and a key-value store.
- **Search, analytics, vector, graph:** none in v1.
- **Retention:** audit log retention of 400 days is proposed (to be confirmed by db-agent and docs-agent). Sessions and tokens follow AP-17.

### 8.6 db-agent deliverables (from tracker)

E1-F2-S3, E2-F1-S1, E3-F1-S1, E4-F1-S1, E5-F1-S1, E6-F1-S1, E8-F1-S1 and E9-F1-S1. db-agent should also confirm or replace ADR-016 and document id, timestamp and money-column conventions consistent with §2.4.

---

## 9. Auth/security approach (ADR-007)

### Credentials

- Passwords are hashed with argon2id via `@node-rs/argon2`, using prebuilt binaries: m = 19 MiB, t = 2, p = 1, with parameters stored in the hash so they can be upgraded later.
- Password policy: 12 to 128 characters and a `@zxcvbn-ts/core` score of at least 3. The check is shared by client and server; the client lazy-loads it. A new password cannot equal the current one.
- Email is trimmed and lowercased, with a maximum of 254 characters. Email verification is not in v1 (§12).

### Tokens and sessions

| Item | Decision |
| --- | --- |
| Access token | JWT (HS256 via `jose`, secret `JWT_ACCESS_SECRET`, at least 32 random bytes), TTL 10 min, claims `sub`, `sid`, `iat`, `exp`, `iss`, `aud`. Held **in memory only** in the SPA and sent as `Authorization: Bearer`. |
| Refresh token | `<sid>.<32 random bytes, base64url>`: the session UUID, a dot, then the secret. Only the SHA-256 of the whole string is stored. The sid is an unauthenticated routing hint (it is not secret and is never trusted without the hash); tokens that do not match the exact format are rejected with 401 before any database access. Sent as cookie `midas_rt`: `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth; Max-Age=30d`. |
| Rotation | Every refresh issues a new refresh token and access token. Sessions have an absolute lifetime of 90 days. |
| Reuse detection | The session keeps the hash of the current and of the immediately previous token. (1) A previous token presented more than 20 s after rotation revokes the whole session. (2) A well-formed token whose hash matches neither (any token two or more rotations old) names its session through the sid: if that session is still live, it is revoked with reason `reuse_detected` (the grace window does not apply, because only the immediately superseded token is tolerated). Both audit `auth.session_reuse_detected`. Within the 20 s grace window the immediately previous token rotates again without revoking, to tolerate concurrent tabs. A forged token that guesses a live sid also ends that session, which is why the sid must stay out of anything but the owner's own credentials. The SPA serializes refresh across tabs with the Web Locks API. |
| Page load | The SPA calls `POST /auth/refresh` to rehydrate. No token is ever stored in localStorage or sessionStorage. |
| Authorization source | Every authenticated request loads the session and user (AP-02). A revoked or expired session, or a suspended user, gets 401. Role checks use the **database role**, not a JWT claim, so suspension and demotion take effect immediately. |
| CSRF | Bearer-authenticated endpoints are not CSRF-prone. Cookie-authenticated endpoints (`/auth/refresh`, `/auth/logout`) require `SameSite=Strict`, an `Origin` header matching `APP_BASE_URL`, and the custom header `X-CSRF-Protection: 1`. |
| Logout | Revokes the session and clears the cookie. Idempotent. |
| Password change | Requires the current password and revokes all other sessions. |
| Password reset | The token is 32 random bytes, stored hashed, valid for 30 min and single-use. Issuing a new token invalidates earlier ones. The link is `APP_BASE_URL/reset-password#token=…`; the fragment keeps the token out of server logs and Referer headers. A successful reset revokes all sessions. The request endpoint always returns 202, and email is sent after the response so timing does not depend on whether the email exists. |
| Login failures | A generic 401 `INVALID_CREDENTIALS`. A suspended account gets 403 `ACCOUNT_SUSPENDED`, but only after the correct password has been verified. A dummy argon2 verification runs for unknown emails so timing stays equal. |

### Roles and authorization

- Guards: `requireUser` (active user or admin) and `requireAdmin`.
- Ownership is enforced in services by scoping every query to `userId`. Cross-user access returns 404.
- Admins cannot suspend or demote themselves or the last active admin.
- Admin endpoints never expose user financial data (ADR-018). This is verified by tests that enumerate admin routes.

### First admin (ADR-013)

- Primary: `pnpm --filter @midas/api cli admin:create --email <email>`. It creates a new account only (it fails if the email exists), prompts for the password, or reads it from stdin with `--password-stdin`. In Docker: `docker compose exec api node dist/cli.js admin:create …`.
- `cli admin:promote --email <email>` promotes an existing user (explicit operator action, audited). Existing accounts are never promoted implicitly because registration does not verify email.
- Fallback for hosts without shell access: if `BOOTSTRAP_ADMIN_EMAIL` is set **and no admin exists**, the first boot creates that account as admin with an unusable random password; the owner sets a password with "Forgot password". If an account with that email already exists, boot logs an error and promotes nothing (use `admin:promote`). Bootstrap is skipped as soon as any admin exists.
- All paths write `system.admin_bootstrapped` or `admin.user_role_changed` to the audit log with a null actor (system).
- There is no "first registered user becomes admin" behavior, which would be a race on public deployments.

### Platform hardening

- **Helmet headers and CSP:** `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`. Also HSTS (production), `Referrer-Policy: no-referrer` and `X-Content-Type-Options: nosniff`.
- **CORS:** disabled in production (same origin). In development it is allowed only from `CORS_ORIGINS`, though dev normally uses the Vite proxy.
- **Rate limits** (configurable via environment; 429 with `Retry-After` and `RateLimit-*` headers):

  | Endpoint | Limit |
  | --- | --- |
  | `POST /auth/login` | 5/min per IP+email, 20/min per IP, 20/h per account (email hash, any IP) |
  | `POST /auth/register` | 5/h per IP |
  | `POST /auth/password/forgot` | 3/h per email-hash, 10/h per IP |
  | `POST /auth/password/reset` and `/verify` | 10/h per IP |
  | `POST /auth/refresh` | 30/min per session (hash of the sid in the cookie; per IP when the cookie is missing or malformed) |
  | `GET /transactions/export` | 10/min per user |
  | Authenticated writes | 120/min per user |
  | Authenticated reads | 600/min per user |

- **Rate-limit keys and stores:** every IP-based key goes through one helper that reduces IPv6 addresses to their /64 network (IPv4-mapped addresses count as IPv4), so a client cannot rotate addresses inside its own prefix. Each limiter owns a separate in-memory LRU store (`RATE_LIMIT_STORE_MAX_KEYS`, default 25000), so flooding keys against one endpoint cannot evict counters of another. Background work (reset emails) is capped at 100 pending tasks; extra tasks are dropped and logged.
- **API detection:** the global per-IP limit and `Cache-Control: no-store` apply to every request whose matched route starts with `/api/` and to unmatched requests; they never depend on the raw URL prefix (`/%61pi/...` reaches the same handler).
- **Proxy trust:** `TRUST_PROXY` is set to the hop count of the hosting platform so client IPs are correct.
- **CSV export:** text cells starting with `=`, `+`, `-`, `@`, tab or carriage return get a leading `'`. Numeric cells are generated server-side as plain numbers.
- **Secrets:** environment variables only, validated at boot with Zod; the app fails fast if one is missing. `.env.example` contains placeholders only. gitleaks runs in CI and as a pre-commit hook.
- **Audit:** the log records auth events and admin actions with IDs only. Failed logins for unknown emails store an HMAC of the email (`AUDIT_HMAC_SECRET`), never the plain email.

---

## 10. Deployment recommendation (ADR-014)

### Local development (Docker Compose)

`compose.yaml` services:

| Service | Image | Purpose |
| --- | --- | --- |
| `db` | Engine per db-agent (assumed `postgres:17`) | Named volume `midas-db-data` |
| `mailpit` | `axllent/mailpit` | SMTP sink on 1025, web UI on 8025 |
| `api` | Dev target of the Dockerfile | `tsx watch`, bind-mounted source, port 3000, runs migrations on start in dev |
| `web` | Dev target | Vite dev server on 5173 with HMR, proxies `/api` and `/health` to `api` so dev behaves as same origin |

- Start everything with `docker compose up`.
- Reset with `docker compose down -v`, then run `pnpm --filter @midas/api cli seed:dev`.
- `.env.example` documents every variable.

### Production

- One production image (`infra/docker/Dockerfile`, target `runtime`), built from the `master` branch in CI and pushed to GitHub Container Registry. It contains the API plus the built SPA. It runs as non-root, has a healthcheck on `/health`, and handles SIGTERM with graceful shutdown that drains Fastify and stops the scheduler.
- One managed relational database (engine per db-agent) with automated backups.
- One SMTP provider (any provider that offers SMTP; configured via environment).
- Migrations run as a release or pre-deploy command (`node dist/cli.js migrate`) before the new version takes traffic. Migrations must be backward compatible for one release (expand, then contract).
- **Reference one-click target:** a Render Blueprint (`infra/render.yaml`) defining a Docker web service and a managed database, with a "Deploy" button in the README. The image is host-agnostic, and `docs/operations/deployment.md` also covers Fly.io (`fly.toml`) and a single VPS (`infra/compose.prod.yaml` with Caddy for automatic TLS).
- **Scheduler placement:** `SCHEDULER_ENABLED=true` on the web service by default, which works on single-instance hosts. When scaling to several instances, either keep it enabled everywhere (database coordination makes this safe) or run a dedicated worker from the same image (`node dist/worker.js`) and disable it on web instances. For hosts that prefer cron, `node dist/cli.js jobs:run recurring` runs one tick and exits.
- **Rollback:** redeploy the previous image tag; expand/contract migrations keep the previous version compatible. Restore from a database point-in-time backup only when data is corrupted. Runbook: `docs/operations/runbook.md`.

### Environment variables

| Category | Variables |
| --- | --- |
| Runtime | `NODE_ENV`, `PORT`, `LOG_LEVEL`, `APP_BASE_URL`, `TRUST_PROXY` |
| Database | `DATABASE_URL` |
| Auth | `JWT_ACCESS_SECRET`, `ACCESS_TOKEN_TTL_SECONDS` (600), `REFRESH_TOKEN_TTL_DAYS` (30), `SESSION_ABSOLUTE_TTL_DAYS` (90), `AUDIT_HMAC_SECRET` |
| Mail | `MAIL_TRANSPORT` (`smtp` \| `console` \| `memory`), `MAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` |
| Scheduler | `SCHEDULER_ENABLED`, `SCHEDULER_INTERVAL_SECONDS` (300), `RECURRING_MAX_CATCHUP` (31), `RECURRING_MAX_FAILURES` (5) |
| Rate limits | `RATE_LIMIT_ENABLED`, plus per-route overrides |
| CORS (dev only) | `CORS_ORIGINS` |
| Observability | `METRICS_TOKEN` (`/metrics` is disabled when unset) |
| Bootstrap | `BOOTSTRAP_ADMIN_EMAIL` (optional, one-time) |

### Email provider abstraction (ADR-010)

```ts
interface Mailer { send(message: { to: string; subject: string; text: string; html: string; tag: MailTag }): Promise<void> }
```

- **Adapters:**
  - `SmtpMailer` (nodemailer) for production and for local development against Mailpit
  - `ConsoleMailer`, which logs the subject and recipient only, never the token, and writes the full message only when `NODE_ENV=development`
  - `MemoryMailer` for tests, which captures messages
- Templates live in `apps/api/src/platform/mailer/templates/` as plain text plus minimal inline-styled HTML.
- Sending is fire-and-forget after the response. Failures are logged with `requestId` and counted in metrics. Adding a provider's HTTP API later means writing one new adapter.

### CI (GitHub Actions)

| Workflow | Runs |
| --- | --- |
| `ci.yml`, on PRs and pushes to `master` | install (cached) → lint → typecheck → unit tests → integration tests (database service container) → build → Docker build (no push on PRs) → coverage gate |
| `security.yml` | gitleaks on every PR and push; `pnpm audit --audit-level high` plus osv-scanner; CodeQL weekly and on PRs |
| `e2e.yml` | on PRs to `master`, plus nightly: compose stack from the production image, then Playwright with axe |
| `release.yml` | on `v*` tags: build and push the image, generate the OpenAPI artifact, create a GitHub release |

Branch protection on `master` requires `ci`, `security` and `e2e`.

---

## 11. Testing strategy

| Layer | Tooling | Scope | Gate |
| --- | --- | --- | --- |
| Unit (shared) | Vitest | Money math, currency exponents, recurrence calculator (month-end clamping, leap years, interval, endDate), budget state boundaries (threshold −1/0/+1, exactly 100%), CSV escaping, percentage normalization | 95% lines for `packages/shared` |
| Unit (api) | Vitest with fake `Clock`, `MemoryMailer` and fake repositories | Service rules: ownership, transfer validation, category reassignment, last-admin, token rotation and reuse grace | 85% lines for auth, transactions, transfers, budgets and recurring; 80% overall |
| Integration (api) | Vitest, Fastify `inject`, Testcontainers (engine per db-agent), migrations applied per run, truncate between tests | Every endpoint: success, validation, 401/403/404 ownership, rate-limit 429, Problem Details shape, response validated against shared Zod schemas; scheduler idempotency with two concurrent runners; time-travel catch-up | Every acceptance criterion maps to at least one test (`AC:` tag in test names) |
| Contract | Generated OpenAPI vs the endpoint list in `api-contract.md`; response schema validation in integration tests | Drift detection | CI fail on drift |
| Component (web) | Vitest, React Testing Library, MSW, `vitest-axe` | Forms, validation messages, route guards, refresh single-flight, money formatting by locale, theme persistence | 80% lines overall |
| E2E | Playwright (Chromium plus WebKit on nightly) against the compose stack built from the production image; reset emails fetched through Mailpit's API; `@axe-core/playwright` on every visited page | Journeys: register → wallet → transaction → transfer → budget warning → dashboard → recurring generation (clock override via test-only env `CLOCK_OVERRIDE`, allowed only when `NODE_ENV=test`) → CSV export → password reset → admin suspend and audit | Retries = 1 in CI, trace on failure, quarantine label for flaky specs |
| Accessibility | axe automated scans plus a manual keyboard and screen-reader checklist (NVDA and VoiceOver) in `docs/qa/` | Both themes, contrast | No serious or critical axe violations |
| Performance | `seed:perf` (100k transactions for one user, 50k users), autocannon scripts in `e2e/perf/` | AP-05, AP-07, AP-09 targets from §8.3; also check EXPLAIN plans | Thresholds documented, regressions reported |
| Security | gitleaks, dependency audit, CodeQL, plus authz route-enumeration tests (every `/api/v1` route except an explicit public allowlist returns 401 without a token; every `/admin` route returns 403 for the user role) | — | No open high or critical findings |

Test data is synthetic. No real personal data appears in fixtures.

---

## 12. Risks and trade-offs

| # | Risk / trade-off | Impact | Mitigation |
| --- | --- | --- | --- |
| R1 | Per-request database authorization check (AP-02) adds a query to every request | Slightly higher latency | Single indexed primary-key join; optional 15 s in-process cache later if metrics show a need |
| R2 | In-memory rate limits are per instance | Limits multiply when scaled out | Document; move to a shared store (db-agent advice) before running more than one instance |
| R3 | No FX conversion: multi-currency users see totals per currency, not a single net worth | UX limitation | Explicit per-currency UI; FX can be added later as a separate rates table without breaking the contract |
| R4 | No email verification at registration | Accounts may use addresses they do not own; password reset could reach the wrong inbox | Deferred to v1.1 (additive endpoints); rate limits on register |
| R5 | Duplicate-email registration returns 409, which reveals that the account exists (the story requires a validation error) | Account enumeration | Rate limits; login and forgot-password do not reveal existence; accepted trade-off |
| R6 | Budget limit edits apply retroactively to past periods | Historical progress changes | Documented; limit history deferred |
| R7 | Recurring catch-up after long downtime creates many transactions | Surprise entries | Cap per tick, catch-up limited to occurrences up to today, `startDate` at most 31 days back, run history visible |
| R8 | Fire-and-forget email can be lost if the process crashes after responding | Missed reset email | The user can request again; failures are logged. An outbox can be added later if needed. |
| R9 | Strict CSP may conflict with libraries that inject `<style>` tags | Broken styles | Verify in E10-F1-S2; allow a hashed exception, or as a last resort `style-src 'unsafe-inline'`, recorded with an ADR |
| R10 | No idempotency keys on POST `/transactions` or `/transfers` | Double-submit duplicates | UI disables submit while pending; `Idempotency-Key` header is a candidate for v1.1 |
| R11 | Last-write-wins on concurrent edits | Rare overwrites | Personal data, so concurrent editors are unlikely; ETag/`If-Match` deferred |
| R12 | Fetch-to-blob CSV download buffers in browser memory | Very large exports use client RAM | Acceptable at personal scale; signed short-lived download URLs later |
| R13 | Database engine not yet confirmed (ADR-016) | Compose and CI placeholders may change | db-agent confirms in E1-F2-S3, before any schema work |
| R14 | The brief names the default branch `master`; the current checkout reports `main` | CI branch filters and protection misconfigured | cicd-agent confirms the branch name in E1-F1-S2 |
| R15 | UI copy is English-only in v1; locale affects number and date formatting only | Limited localization | Strings kept in one module per feature so i18n can be added later |
| R16 | The tracker requires ADRs under `docs/adr/`; this log lives in §14 | Story E1-F1-S1 acceptance criterion | docs-agent mirrors §14 into `docs/adr/NNNN-*.md` during E1-F4-S3 |

Any discrepancy between `api-contract.md` and implementation needs must be raised as a risk to the architect, never fixed by editing the contract downstream.

---

## 13. Final implementation plan

### 13.1 Repository and folder structure

```
midas-app/
├─ apps/
│  ├─ api/                         # @midas/api (Fastify, Node 24)
│  │  ├─ src/
│  │  │  ├─ app.ts                 # buildApp(deps) -> Fastify instance (used by tests)
│  │  │  ├─ server.ts              # HTTP entry (starts scheduler if enabled)
│  │  │  ├─ worker.ts              # scheduler-only entry
│  │  │  ├─ cli.ts                 # migrate, seed:*, admin:create, admin:promote, jobs:run
│  │  │  ├─ platform/              # config, db, logger, errors, auth-guards, rate-limit,
│  │  │  │                         # clock, mailer (+templates), scheduler, metrics, static-spa
│  │  │  └─ modules/
│  │  │     ├─ auth/  users/  wallets/  categories/  transactions/
│  │  │     ├─ transfers/  budgets/  reports/  recurring/  admin/  audit/
│  │  │     │   └─ routes.ts  service.ts  repository.ts  *.test.ts
│  │  ├─ test/                     # integration helpers, factories, testcontainers setup
│  │  └─ db/                       # migrations + seeds (structure per db-agent)
│  └─ web/                         # @midas/web (React + Vite)
│     ├─ src/
│     │  ├─ app/                   # router, providers (query, theme, auth), app shell, layouts
│     │  ├─ routes/                # TanStack file routes: _public, _app, _app/admin
│     │  ├─ features/
│     │  │  ├─ auth/ settings/ wallets/ categories/ transactions/ transfers/
│     │  │  ├─ budgets/ dashboard/ recurring/ admin/
│     │  │  │   └─ api.ts  hooks.ts  components/  *.test.tsx
│     │  ├─ components/ui/         # design-system primitives (Radix-based)
│     │  ├─ lib/                   # api-client, auth token holder, refresh single-flight,
│     │  │                         # money/date formatting, url-state helpers
│     │  ├─ styles/                # tailwind entry, tokens (light/dark)
│     │  └─ test/                  # msw handlers, render helpers
│     └─ index.html
├─ packages/
│  └─ shared/                      # @midas/shared: zod schemas, enums, currencies, locales,
│                                  # icon/color allowlists, money, recurrence, budget-state
├─ tooling/
│  ├─ eslint-config/  tsconfig/    # shared presets
├─ e2e/                            # @midas/e2e: playwright specs, fixtures, perf scripts
├─ infra/
│  ├─ docker/Dockerfile            # targets: dev, build, runtime
│  ├─ compose.prod.yaml            # VPS option (app + Caddy)
│  └─ render.yaml                  # one-click blueprint
├─ docs/
│  ├─ architecture.md  api-contract.md  project-brief.md
│  ├─ adr/  api/  operations/  qa/  user-guide/
├─ .github/ (workflows/, ISSUE_TEMPLATE/, pull_request_template.md)
├─ compose.yaml  .env.example  .editorconfig  .gitattributes  .npmrc
├─ package.json  pnpm-workspace.yaml  pnpm-lock.yaml  tsconfig.base.json
└─ README.md  CONTRIBUTING.md  SECURITY.md  LICENSE  CODE_OF_CONDUCT.md
```

### 13.2 Sequencing (mapped to tracker sprints)

1. **Sprint 1, Foundation**
   - E1-F1-S1: this document plus the ADRs mirrored into `docs/adr/`.
   - E1-F1-S3: the API contract, plus OpenAPI generated from `packages/shared`.
   - E1-F1-S2 and E1-F3-S1/S2/S3: repo scaffold, compose, CI, security scans.
   - db-agent: E1-F2-S3 (confirm ADR-016), then E2-F1-S1.
   - E1-F2-S1 and E1-F2-S2: skeletons. The backend includes config validation, `/health`, Problem Details, the request-id plugin, `Clock` and `Mailer` ports. The frontend includes the router, API client and theme.
   - ui-ux-agent: E1-F4-*.
   - E2-F2-S1: registration, including argon2id, default preferences and the audit write.
2. **Sprint 2, Core Features**
   - Sessions and refresh rotation (E2-F2-S2), then guards and single-flight refresh (E2-F2-S4).
   - Password reset with Mailpit (E2-F3-*) and settings (E2-F4-*).
   - Wallets (E3-F1-*), then categories (E4-F1-*), then the transactions schema (E5-F1-S1), then CRUD and list (E5-F2-*), then transfers (E3-F2-*).
3. **Sprint 3, Secondary Features**
   - CSV export (E5-F3-*).
   - Budgets and warnings (E6-F1-*): shared budget-state math first.
   - Reports (E7-F1-*), then dashboard UI (E7-F2-*).
   - Recurring (E8-F1-*): shared recurrence math, then API, then scheduler with time-travel tests, then UI.
   - Audit (E9-F1-*), then admin users, categories and metrics (E9-F2-*, E9-F3-*).
4. **Sprint 4, Quality and Release**
   - Rate limits and headers (E10-F1-S1/S2), then reviews (E10-F1-S3/S4).
   - Coverage, E2E, accessibility and performance (E10-F2-*).
   - Observability (E10-F3-S1), then the deployment blueprint (E10-F3-S2), then docs and README (E10-F3-S3/S4), then the release checklist (E10-F3-S5).

### 13.3 Definition of ready for coding agents

- `docs/api-contract.md` exists and is unchanged by implementers.
- db-agent has confirmed the engine and ORM and published conventions (E1-F2-S3).
- `packages/shared` exports the schemas for the stories in progress.

---

## 14. Architecture decision log (ADR-style)

Each entry: **Status · Context · Decision · Alternatives rejected · Consequences**. All are Accepted on 2026-10-16 unless noted otherwise.

### ADR-001: Modular monolith, single deployable

- **Context:** small team, moderate domain, one-click deployment wanted, strict money consistency.
- **Decision:** one Fastify app with domain modules and internal service boundaries; the SPA is served by the same process.
- **Alternatives rejected:** microservices (operational overhead, distributed transactions for transfers); separate frontend host (CORS and cookie complexity, two deploys).
- **Consequences:** simple operations and local ACID transactions. Module boundaries must be enforced by convention and lint rules (no cross-module repository imports). A module can be extracted later if ever needed.

### ADR-002: Backend in TypeScript on Node.js 24 LTS with Fastify 5

- **Context:** fullstack type sharing, mature security plugins, schema-driven OpenAPI.
- **Decision:** TypeScript (strict), Node 24 LTS, Fastify 5, Zod 4, `fastify-type-provider-zod`, pino, `jose`, `@node-rs/argon2`, nodemailer, prom-client, date-fns v4 with `@date-fns/tz`.
- **Alternatives rejected:** Python with FastAPI (no ML need, duplicated types); Go (no concurrency or latency driver, second toolchain); NestJS (heavy DI and decorator boilerplate); Express (weaker schema integration).
- **Consequences:** a single language and contract package across the stack. Native argon2 binaries must match the Docker base image, which `node:24-slim` prebuilds cover.

### ADR-003: Frontend in React 19 with Vite, TanStack Router and TanStack Query

- **Context:** authenticated app with filter-heavy screens, an accessibility mandate, charts.
- **Decision:** React with Vite; TanStack Router for typed routes and search params; TanStack Query; React Hook Form with shared Zod schemas; Tailwind v4 tokens; Radix primitives; Recharts; lucide icons limited to an allowlist.
- **Alternatives rejected:** Next.js (server runtime and RSC with no SEO payoff); React Router framework mode (SSR unnecessary, weaker typed search params); Vue or Svelte (no justification to leave the default); Redux (server state is covered by Query).
- **Consequences:** a static build and fast development. Client-side code splitting is required to keep the initial bundle small (charts and zxcvbn lazy-loaded).

### ADR-004: Rendering is client-side only, served from the API origin

- **Decision:** CSR for all routes; the SPA is served by Fastify with `index.html` fallback and immutable hashed assets.
- **Alternatives rejected:** SSR, SSG, ISR, RSC and hybrid (see §5).
- **Consequences:** no CORS in production, `SameSite=Strict` cookies work, and there is one image. Public pages are not server-rendered, which is acceptable because SEO is not a goal.

### ADR-005: pnpm workspaces monorepo on the Node runtime

- **Decision:** pnpm 10.x via Corepack; workspaces `apps/*`, `packages/*`, `tooling/*`, `e2e`; commit `pnpm-lock.yaml`.
- **Alternatives rejected:** Bun as installer and runtime (runtime compatibility risk for native modules; marginal benefit given Vite and Vitest); npm (slower, weaker workspace isolation); Turborepo or Nx (unnecessary at three packages; can be added later).
- **Consequences:** strict dependency isolation and reproducible CI. Contributors run `corepack enable`.

### ADR-006: REST, a code-first OpenAPI spec, Problem Details and two pagination styles

- **Decision:** versioned REST (`/api/v1`); OpenAPI 3.1 generated from shared Zod schemas; RFC 9457 errors with stable codes; keyset cursors for high-volume lists and page numbers for the admin user table; 404 for foreign resources; strict schemas that reject unknown fields.
- **Alternatives rejected:** GraphQL (adds complexity for a fixed set of screens and makes rate limiting and authz harder to reason about); tRPC (couples clients to TypeScript, which is weaker for a public API reference); a hand-written OpenAPI spec (drift risk).
- **Consequences:** a single source of truth for types. `api-contract.md` stays the human authority, and contract tests catch drift.

### ADR-007: Short-lived JWT access token in memory, rotating refresh token in an httpOnly cookie, argon2id

- **Decision:** as specified in §9: 10-minute access JWT, 30-day rotating refresh token with reuse detection and a 20-second grace window, 90-day absolute session, authorization loaded from the database per request.
- **Alternatives rejected:**
  - Pure server-side session cookie: viable and simpler, but the stories require separate access and rotating refresh credentials, and every endpoint would need CSRF defenses.
  - Tokens in localStorage: exposed to XSS.
  - Long-lived JWT without a database check: suspension would be delayed.
  - bcrypt: weaker against GPU attacks than argon2id.
- **Consequences:** an XSS attacker cannot read the refresh token, and suspension takes effect immediately. The cost is one database lookup per request (R1) and refresh coordination across tabs.

### ADR-008: Multi-currency policy

- **Decision:** a single currency per wallet, locked once used; no FX; cross-currency transfers require an explicit destination amount; totals per currency; reports and budgets in one currency each; the preference currency is only a default.
- **Alternatives rejected:** single currency per user (too limiting); automatic FX conversion (needs an external rates provider, historical rates and rounding policy, out of scope); rejecting all cross-currency transfers (blocks a common real-world need when an explicit amount solves it).
- **Consequences:** the books are always exact, with no rate drift. There is no consolidated net worth across currencies in v1 (R3).

### ADR-009: Integer minor units

- **Decision:** `amountMinor` integers using ISO 4217 exponents from the shared currency table; at most 10^14 in absolute value; positive transaction amounts with direction from type; signed balances; percentages computed with integer math and rounded only for display (largest-remainder method so breakdowns sum to 100).
- **Alternatives rejected:** decimal strings in the API (heavier for clients); floats (rounding errors).
- **Consequences:** clients must divide by the currency exponent for display, and shared helpers do this.

### ADR-010: Email provider abstraction

- **Decision:** a `Mailer` port with `smtp`, `console` and `memory` adapters; Mailpit for local development; asynchronous sending after the response; templates in the repository.
- **Alternatives rejected:** a vendor HTTP SDK as the primary adapter (lock-in; SMTP is universal); a transactional outbox table (more than v1 needs; R8 accepted).
- **Consequences:** any SMTP provider works through environment configuration. End-to-end tests read reset emails from Mailpit.

### ADR-011: Recurring scheduler runs in process and is coordinated through the database

- **Decision:** a timer every `SCHEDULER_INTERVAL_SECONDS` (default 300). It claims due templates in batches with row locks that skip locked rows, generates each occurrence in its own database transaction, and uses unique (templateId, occurrenceDate) as the idempotency guard. Catch-up, pause, failure and retry policy are in §2.4. The same job runs from `worker.ts` or as a one-off CLI tick. The scheduler also runs daily housekeeping (AP-17) and the `BOOTSTRAP_ADMIN_EMAIL` check at boot.
- **Alternatives rejected:**
  - Redis-backed queue (BullMQ): extra infrastructure, against the one-database deployment goal.
  - Database-backed job library (for example pg-boss): viable, but it ties the design to one engine before db-agent decides, and it is more than a single periodic job needs. It can be revisited.
  - External cron only: not available on every host, and harder to test.
  - Generating on read when the user opens the app: transactions would be missing from reports until the user visits, and it adds hidden write paths.
- **Consequences:** no extra services, and it is safe to run concurrently. Testing relies on the injected `Clock`. Tick latency means generation can be up to 5 minutes after the start of a user's day.

### ADR-012: Budgets use calendar periods, monthly by default, with an 80% warning threshold

- **Decision:** weekly (ISO Monday), monthly (default) and yearly calendar-aligned periods; overall or per-expense-category scope; per-currency; per-budget threshold of 1 to 99 (default 80); states `ok`, `warning` and `exceeded`, with exceeded at 100% or more; computed on read.
- **Alternatives rejected:** custom period start days (for example pay-day cycles), deferred because they complicate period math and the UI; stored per-period budget instances (duplication with little value in v1); exceeded only when strictly over 100% (users expect "limit reached" to be flagged).
- **Consequences:** simple and deterministic. Limit edits are retroactive (R6).

### ADR-013: First admin via CLI, with a one-time bootstrap setting as fallback

- **Decision:** `cli admin:create` creates a new admin account and `cli admin:promote` is the explicit, audit-logged way to promote an existing one; optional `BOOTSTRAP_ADMIN_EMAIL` creates its own account once, and only while no admin exists.
- **Amendment (code review H-1):** registration does not verify email ownership, so matching an account by email alone must never grant admin. A person could register the operator's email first and keep a known password. Therefore: `admin:create` fails when the email exists (the check and the insert run in one transaction under the admin-set lock, backed by the unique email index, so a concurrent registration cannot make it silently drop the supplied password); `BOOTSTRAP_ADMIN_EMAIL` never promotes an existing account (it logs an error and does nothing) and otherwise creates the account with a random unusable password, which the owner replaces through the password-reset email; `admin:promote` stays an operator action with shell access and writes `admin.user_role_changed`.
- **Alternatives rejected:** first registered user becomes admin (race on public deployments); seeding admin credentials from environment variables (a plaintext password in host config); a database migration with a fixed admin (a secret in the repository).
- **Consequences:** an operator step is required after the first deploy, and the deployment guide documents it.

### ADR-014: Single Docker image on a container host, with a Render Blueprint as the one-click reference

- **Decision:** a multi-stage image with the API and SPA; managed database; migrations as a release step; `render.yaml` blueprint plus Fly.io and VPS (Compose + Caddy) guides; images in GitHub Container Registry; GitHub Actions CI.
- **Alternatives rejected:** serverless functions (long-running scheduler and streaming CSV fit poorly, plus cold starts); Kubernetes (excessive for v1); separate static frontend hosting (CORS and cookie complexity).
- **Consequences:** portable and inexpensive. Scaling out requires the shared rate-limit store (R2).

### ADR-015: Testing toolset

- **Decision:** Vitest everywhere, Testcontainers for integration tests, MSW and RTL for components, Playwright with axe for E2E and accessibility, autocannon for performance, and the coverage gates in §11.
- **Alternatives rejected:** Jest (slower; Vitest matches Vite); Cypress (Playwright has better multi-browser support and parallelism); mocking the database in integration tests (misses constraint and locking behavior that money correctness depends on).
- **Consequences:** CI needs Docker for integration and E2E jobs, which GitHub-hosted runners provide.

### ADR-016: Database engine

- **Status:** Accepted. Resolved by db-agent in [docs/database.md](./database.md) (§2 and DB-ADR-01): PostgreSQL 17 with Kysely on `pg` and node-pg-migrate. Requirements remain in §8.
- **Decision owner:** db-agent (E1-F2-S3). The query layer and migration tooling satisfy the up/down migration and raw-SQL requirements in §8.1. See docs/database.md for alternatives rejected and consequences.

### ADR-017: Date-only ledger with a timezone per user

- **Decision:** `occurredOn` and all period math use calendar dates; users have an IANA timezone used to compute "today"; system timestamps are UTC.
- **Alternatives rejected:** timestamps for transactions (day-boundary bugs across timezones; no product need for a time of day); server-timezone "today" (wrong for users far from UTC).
- **Consequences:** reports group by date with no timezone conversion. The scheduler evaluates due dates per user timezone.

### ADR-018: Admin privacy boundary

- **Decision:** admin capabilities never include reading, per-user aggregation or export of another user's financial records. Admin metrics are platform-wide counts. The audit log excludes financial details and secrets. This is enforced by route design and by authz enumeration tests.
- **Alternatives rejected:** an admin "view as user" mode or per-user financial statistics (privacy risk, outside the brief).
- **Consequences:** support investigations rely on the audit log and the user's own exports.

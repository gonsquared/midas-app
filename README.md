# Midas

A personal finance tracker for recording income, expenses and transfers across multiple wallets, planning spending with budgets, automating regular items, and understanding your money through a dashboard and reports.

> **Status: Sprint 2 (Core Features) implemented; Sprint 3 and 4 not started.**
> Implemented: pnpm monorepo, CI, Docker Compose stack, design system, database migrations, and the Sprint 2 features (registration, login and sessions, password reset, profile and settings, wallets, categories, transactions, transfers) in both the API and the web app. Export, budgets, dashboard, recurring transactions and admin are planned for Sprint 3. See [docs/dev-stories-tracker.md](./docs/dev-stories-tracker.md) for per-story status.

## Features (planned for v1)

- **Dashboard:** balances per wallet and per currency, income vs expense for a period, trends, category breakdown, budget status.
- **Wallets:** cash, bank, card and savings wallets, each in one currency, with an opening balance, archiving and transfers between wallets.
- **Transactions:** income, expense and transfers with categories, search, filters, and CSV export.
- **Categories:** system defaults plus personal categories with icons and colors.
- **Budgets:** weekly, monthly (default) or yearly, overall or per category, with warning and exceeded states.
- **Reports:** income vs expense trends and spending by category.
- **Recurring transactions:** daily, weekly, monthly and yearly templates that generate transactions automatically.
- **Accounts:** registration, sign-in, password reset by email, profile, currency, locale, timezone and light/dark theme.
- **Admin:** user management (search, suspend, reactivate, roles), system categories, platform metrics and an audit log. Admins cannot see users' private financial records.

Out of scope for v1: bank syncing, shared wallets, receipt OCR, native mobile apps, payments and subscriptions.

## Tech stack

| Area | Choice |
| --- | --- |
| Runtime and package manager | Node.js 24, pnpm 10 workspaces (via Corepack) |
| Backend | TypeScript, Fastify 5, Zod 4, argon2id, jose (JWT) |
| Frontend | React 19, Vite, Tailwind CSS v4, Radix UI |
| Database | PostgreSQL 17, Kysely on `pg`, node-pg-migrate |
| Mail | SMTP (Mailpit for local development) |
| Testing | Vitest, Testcontainers |
| Delivery | Docker, Docker Compose, GitHub Actions |

The web app also uses TanStack Router and Query; browser tests use Playwright (`e2e/`) and component tests use vitest-axe. TODO: Recharts is not a dependency yet (planned for the Sprint 3 dashboard).

## Architecture summary

- **Modular monolith.** One Fastify process hosts the domain modules. The React SPA is built separately and is planned to be served from the same origin by the API (not implemented yet, see Deployment notes).
- **Shared package.** `@midas/shared` holds Zod schemas and helpers used by both apps.
- **Money** is stored as integer minor units.
- **Database.** PostgreSQL 17 with SQL migrations (node-pg-migrate) and generated Kysely types. The app connects as a restricted role; migrations run as the owner role (`DATABASE_MIGRATION_URL`).
- **Security.** See "Security notes" below. Passwords hashed with argon2id, configuration validated at boot (fail fast, values never echoed), placeholder secrets rejected outside tests, helmet headers, rate limiting on auth and API endpoints, strict CSP for the SPA (no inline scripts or styles), gitleaks secret scanning and dependency audit in CI. See [SECURITY.md](./SECURITY.md).

## Repository structure

```
midas-app/
├─ apps/
│  ├─ api/          # @midas/api: Fastify backend (src/modules, src/platform, db migrations and seeds)
│  └─ web/          # @midas/web: React + Vite frontend and design system
├─ packages/
│  └─ shared/       # @midas/shared: shared Zod schemas and helpers
├─ tooling/         # shared tooling presets
├─ e2e/             # Playwright end-to-end suites (pnpm test:e2e)
├─ infra/           # Dockerfile and database init scripts
├─ .github/         # CI workflow, Dependabot, templates
├─ compose.yaml  .env.example  package.json  pnpm-workspace.yaml
└─ README.md  CONTRIBUTING.md  SECURITY.md  LICENSE
```

## Local setup

Prerequisites: Node.js 24, Corepack (ships with Node), and Docker with Compose for the database.

```bash
corepack enable                 # once per machine; pins pnpm to the packageManager version (10.x)
pnpm install
cp .env.example .env            # then replace every change-me-* placeholder
```

Generate a JWT secret with, for example, `openssl rand -base64 48`.

### Run with Docker Compose

```bash
docker compose up --build       # PostgreSQL 17, Mailpit, one-shot migrate, API
```

- The `migrate` service is one-shot: it runs `migrate` then `seed:system` through the owner role (`DATABASE_MIGRATION_URL`) and exits. `api` starts only after it succeeds.
- Mailpit receives development mail (password reset emails); read it at http://localhost:8025.
- Container networking overrides `DATABASE_URL`, `DATABASE_MIGRATION_URL`, `APP_BASE_URL` (`http://localhost:3000`) and the SMTP settings, so the values in `.env` (written for running on the host) are not used by these services. `.env` must still define `POSTGRES_PASSWORD` and `MIDAS_APP_DB_PASSWORD`.
- **The Compose stack does not serve the SPA yet.** The API has no static-SPA plugin, so `http://localhost:3000` serves only the API. Run the web dev server on the host (below) to use the UI. The header comment in `compose.yaml` mentions serving the built SPA; that is not implemented.
- TODO: `docker compose up` was not verified end to end by this documentation pass; confirm before relying on it.

| Service                   | URL                   |
| ------------------------- | --------------------- |
| API                       | http://localhost:3000 |
| Mailpit UI (SMTP on 1025) | http://localhost:8025 |
| PostgreSQL                | localhost:5432        |

Ports are published on 127.0.0.1 only. The web dev server (below) is not part of the Compose stack. Reset local data with `docker compose down -v`.

### Run the apps in development

```bash
pnpm --filter @midas/api dev    # API with watch mode, loads ../../.env (port 3000)
pnpm --filter @midas/web dev    # Vite dev server (port 5173), proxies /api to the API
```

First run on the host: `docker compose up -d db mailpit`, then `migrate` and `seed:system` (below), then the two dev servers. Set `CORS_ORIGINS` only if the browser calls the API from an origin other than the Vite proxy.

### Database migrations

Run from the repository root; each maps to a script in `apps/api/package.json`.

```bash
pnpm --filter @midas/api migrate          # apply pending migrations
pnpm --filter @midas/api migrate:down     # roll back
pnpm --filter @midas/api migrate:status   # show applied/pending
pnpm --filter @midas/api migrate:verify   # up, down to zero, up; checks catalogs are identical
pnpm --filter @midas/api seed:system      # idempotent system categories; run after migrate
pnpm --filter @midas/api db:codegen       # regenerate Kysely types from the database
pnpm --filter @midas/api db:migrate:create <name>   # scaffold a new migration
```

`migrate`, `migrate:down`, `migrate:status`, `migrate:verify` and `seed:system` connect through `DATABASE_MIGRATION_URL` (owner role). Schema design, conventions, role setup and the release procedure are in [docs/database.md](./docs/database.md) and [apps/api/db/README.md](./apps/api/db/README.md).

### Backup and restore (local)

From docs/database.md section 14.3:

```bash
docker compose exec db pg_dump -U midas_owner -Fc midas > midas.dump
docker compose exec -T db pg_restore -U midas_owner -d midas --clean --if-exists < midas.dump
```

Production targets (provider PITR, daily encrypted logical dumps, restore into a new instance, never over the live one) are in docs/database.md section 14. The `db:check` integrity command is planned and not implemented. TODO: `docs/operations/runbook.md` does not exist yet.

## Checks and tests

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e                   # Playwright against the Vite dev server with a fake API (no database)
```

- `pnpm test` runs Vitest in `@midas/shared`, `@midas/api` and `@midas/web`.
- Database-backed API tests use Testcontainers, which **needs Docker**, or an existing PostgreSQL 17 server when `TEST_DATABASE_URL` is set (admin URL; a throwaway database is created and dropped). They are skipped when neither is available, so a green run without Docker does not exercise them.
- Do not substitute PGlite: it is PostgreSQL 18 and fails some DB tests (different SQLSTATE for `ON DELETE RESTRICT`, lost protocol sync after errors).
- Watch mode: `pnpm --filter @midas/api test:watch`.
- `pnpm test:e2e` specs intercept `/api/v1` with an in-memory fake. Set `E2E_BASE_URL` to target an already running app instead of starting Vite. TODO: document Playwright browser installation (not confirmed from project files).
- **Opt-in real-API e2e** (`e2e/tests/real-api.spec.ts`) needs a running API on PostgreSQL 17 with `migrate` and `seed:system` applied: `E2E_REAL_API=1 E2E_BASE_URL=http://localhost:5173 pnpm test:e2e -- real-api`. The password-reset spec also needs `E2E_MAIL_LOG` set to the API log file, with the API started using `MAIL_TRANSPORT=console` and `LOG_LEVEL=info`. Without `E2E_REAL_API=1` these specs are skipped.

## Environment variables

[`.env.example`](./.env.example) lists all variables with placeholders only; never commit real secrets. The API validates the variables below at boot (`apps/api/src/platform/config.ts`) and exits with a clear error when one is invalid.

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `NODE_ENV` | no | `development` | `development`, `test` or `production` |
| `HOST` | no | `0.0.0.0` | Bind address |
| `PORT` | no | `3000` | 1 to 65535 |
| `LOG_LEVEL` | no | `info` | `fatal` to `trace`, or `silent` |
| `APP_BASE_URL` | production: yes | `http://localhost:5173` | Public URL used in reset links. Must be set and use `https` in production |
| `APP_VERSION` | no | `0.0.0` | Reported by `GET /health` |
| `TRUST_PROXY` | no | `0` | Reverse-proxy hops to trust (0 to 10) |
| `DATABASE_URL` | yes | none | `postgres://` URL for the app role |
| `DATABASE_MIGRATION_URL` | no | `DATABASE_URL` | Owner role used by migrations |
| `DATABASE_POOL_MAX` | no | `10` | Max 200 |
| `DATABASE_STATEMENT_TIMEOUT_MS` | no | `15000` | |
| `DATABASE_SSL` | no | `verify-full` in production, else `off` | `off`, `require`, `verify-full`; `off` is rejected in production |
| `DATABASE_SSL_CA` | no | none | CA certificate for `verify-full` |
| `JWT_ACCESS_SECRET` | yes | none | At least 43 characters; `change-me` placeholders rejected outside `NODE_ENV=test` |
| `ACCESS_TOKEN_TTL_SECONDS` | no | `600` | Max 3600 |
| `REFRESH_TOKEN_TTL_DAYS` | no | `30` | Max 365 |
| `SESSION_ABSOLUTE_TTL_DAYS` | no | `90` | Must be >= `REFRESH_TOKEN_TTL_DAYS` |
| `RATE_LIMIT_ENABLED` | no | `true` | |
| `RATE_LIMIT_REGISTER_MAX` | no | `5` | Registrations per IP per window |
| `RATE_LIMIT_REGISTER_WINDOW_SECONDS` | no | `3600` | |
| `RATE_LIMIT_LOGIN_MAX` | no | `5` | Login attempts per IP + email, per minute |
| `RATE_LIMIT_LOGIN_IP_MAX` | no | `20` | Login attempts per IP, per minute |
| `RATE_LIMIT_LOGIN_ACCOUNT_MAX` | no | `20` | Login attempts per account (email hash) from any IP, per hour; see Security notes |
| `RATE_LIMIT_FORGOT_EMAIL_MAX` | no | `3` | Forgot-password requests per email hash, per hour |
| `RATE_LIMIT_FORGOT_IP_MAX` | no | `10` | Forgot-password requests per IP, per hour |
| `RATE_LIMIT_RESET_MAX` | no | `10` | Reset and verify requests per IP, per hour |
| `RATE_LIMIT_REFRESH_MAX` | no | `30` | Per session (IP when the cookie is missing or malformed), per minute |
| `RATE_LIMIT_PASSWORD_CHANGE_MAX` | no | `10` | Per user, per hour |
| `RATE_LIMIT_USER_WRITE_MAX` | no | `120` | Authenticated writes per user, per minute |
| `RATE_LIMIT_USER_READ_MAX` | no | `600` | Authenticated reads per user, per minute |
| `RATE_LIMIT_GLOBAL_IP_MAX` | no | `1200` | All `/api` requests per IP, per minute |
| `RATE_LIMIT_STORE_MAX_KEYS` | no | `25000` | Capacity of each limiter's in-memory LRU store (max 1000000) |
| `TEST_DATABASE_URL` | no | none | Tests only, see above |
| `TEST_DATABASE_IMAGE` | no | `postgres:17-bookworm` | Tests only, Testcontainers image |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `MIDAS_APP_DB_PASSWORD` | Compose | see `.env.example` | Used by the Compose database container only |
| `MAIL_TRANSPORT` | no | `smtp` (`memory` when `NODE_ENV=test`) | `smtp`, `console` or `memory`. Must be `smtp` in production. `console` logs recipient and subject only (body too in development) |
| `MAIL_FROM` | no | `Midas <no-reply@localhost>` | Sender address |
| `SMTP_HOST` | no | `localhost` | |
| `SMTP_PORT` | no | `1025` | 1 to 65535 |
| `SMTP_SECURE` | no | `false` | `true` = implicit TLS (port 465). In production with `false`, STARTTLS is required and the server certificate is verified; local dev (Mailpit) stays plaintext |
| `SMTP_USER`, `SMTP_PASSWORD` | no | none | SMTP credentials |
| `CORS_ORIGINS` | no | none | Development only. Comma-separated `scheme://host[:port]` origins, no paths or wildcards; invalid values fail boot. Ignored in production (same-origin SPA, no CORS headers) |
| `DATABASE_MAINTENANCE_URL`, `AUDIT_RETENTION_DAYS`, `AUDIT_HMAC_SECRET`, `SEED_DEMO_PASSWORD`, `SCHEDULER_*`, `RECURRING_*`, `METRICS_TOKEN`, `BOOTSTRAP_ADMIN_EMAIL` | no | see `.env.example` | Listed for later sprints; not read by the config module yet |
| `E2E_BASE_URL`, `E2E_REAL_API`, `E2E_MAIL_LOG` | no | none | Playwright only, see Checks and tests |

The web dev server also reads `VITE_DEV_HOST` (see [CONTRIBUTING.md](./CONTRIBUTING.md)).

## API

Base path `/api/v1`. Request and response shapes, the error format, pagination and the endpoint index are in [docs/api-contract.md](./docs/api-contract.md); that document also describes Sprint 3 endpoints that are not implemented yet. TODO: no OpenAPI document is published.

Implemented (Sprint 2):

| Area | Endpoints |
| --- | --- |
| Ops | `GET /health` (liveness, database readiness, `APP_VERSION`) |
| Auth | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/password/forgot`, `/auth/password/reset/verify`, `/auth/password/reset` |
| Me | `GET /me`, `PATCH /me`, `POST /me/password` |
| Wallets | `GET, POST /wallets`; `GET, PATCH, DELETE /wallets/{walletId}`; `POST /wallets/{walletId}/archive` and `/unarchive` |
| Categories | `GET, POST /categories`; `PATCH, DELETE /categories/{categoryId}` |
| Transactions | `GET, POST /transactions`; `GET, PATCH, DELETE /transactions/{transactionId}` |
| Transfers | `POST /transfers`; `GET, PATCH, DELETE /transfers/{transferId}` |

Authenticated routes expect `Authorization: Bearer <access token>`; the refresh token travels only in the `midas_rt` cookie. Not implemented yet: transaction CSV export, budgets, reports, recurring templates, admin, `/metrics`.

## Security notes

- **Access token:** short-lived HS256 JWT (`ACCESS_TOKEN_TTL_SECONDS`, default 600), sent as a bearer token; only HS256 is accepted.
- **Refresh token:** format `<session uuid>.<43 base64url chars>` (32 random bytes). Only its SHA-256 hash is stored. Sent as the `midas_rt` cookie (`HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`). The session id inside is not trusted; it only identifies which session to revoke.
- **Rotation and reuse detection:** each refresh rotates the token. A superseded token seen inside the grace window rotates again; outside it the token counts as replayed and the whole session is revoked (`reuse_detected`). A replayed token older than the immediately previous one still revokes the session it names. Malformed tokens are rejected without a database lookup. Sessions also end at `SESSION_ABSOLUTE_TTL_DAYS`.
- **Rate limits:** fixed windows per endpoint (login per IP+email and per IP per minute, login per account per hour, forgot-password, reset, refresh, password change, per-user read/write, global per-IP). Only the maximums are tunable through `RATE_LIMIT_*`. Counters are in memory, one LRU store per limiter capped by `RATE_LIMIT_STORE_MAX_KEYS`, so they reset on restart and are not shared across instances. Set `TRUST_PROXY` correctly behind a reverse proxy, otherwise all clients share one IP.
- **Per-account login limiter trade-off:** `RATE_LIMIT_LOGIN_ACCOUNT_MAX` caps attempts against one account from any IP, which blunts distributed credential stuffing, but an attacker who knows an email can send failing attempts to lock that account out of logging in until the hour window rolls over.
- **Reset throttling trade-off:** forgot-password is throttled per email hash and per IP, so a third party can use up a victim's per-email allowance and delay the victim's own reset requests for the window. TODO: confirm exact response behaviour in docs/api-contract.md section 4.
- **Production checks (fail fast at boot):** `APP_BASE_URL` set and `https`; `MAIL_TRANSPORT=smtp`; `DATABASE_SSL=off` rejected; placeholder JWT secret rejected; SMTP must use STARTTLS (or `SMTP_SECURE=true`) with certificate verification.
- Vulnerability reporting and secret handling: [SECURITY.md](./SECURITY.md).

## Deployment notes

- Release procedure: run `migrate` and `seed:system` before starting the new image (docs/database.md section 11.7).
- TODO (Sprint 4): serve the built SPA from the API, and add a CI job that runs Playwright against the production build under the real CSP. Neither exists today; current Playwright runs use the Vite dev server.

## Roadmap

| Sprint | Name | Focus |
| --- | --- | --- |
| 1 | Foundation | Monorepo, CI, Docker, API and web skeletons, design system, migrations, registration (some stories still open, see tracker) |
| 2 | Core Features | Login and sessions, password reset, settings, wallets, categories, transactions, transfers |
| 3 | Secondary Features | CSV export, budgets, dashboard and reports, recurring transactions, admin |
| 4 | Quality and Release | Security hardening, accessibility, performance, deployment, documentation, v1.0 release |

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup, checks and conventions, and [SECURITY.md](./SECURITY.md) for reporting vulnerabilities.
## License

[MIT](./LICENSE) © 2026 Daryll

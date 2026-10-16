# Midas

A personal finance tracker for recording income, expenses and transfers across multiple wallets, planning spending with budgets, automating regular items, and understanding your money through a dashboard and reports.

> **Status: Sprint 1 (Foundation) in progress.**
> Implemented: pnpm monorepo, API skeleton with the registration endpoint, web app shell and design system, database migrations, Docker Compose stack and CI. The features below are the v1 plan; only registration exists today.

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

Planned for later sprints: TanStack Router and Query, Recharts, Playwright and axe end-to-end tests.

## Architecture summary

- **Modular monolith.** One Fastify process hosts the domain modules. The React SPA is built separately and is planned to be served from the same origin by the API (static-SPA plugin not yet landed).
- **Shared package.** `@midas/shared` holds Zod schemas and helpers used by both apps.
- **Money** is stored as integer minor units.
- **Database.** PostgreSQL 17 with SQL migrations (node-pg-migrate) and generated Kysely types. The app connects as a restricted role; migrations run as the owner role (`DATABASE_MIGRATION_URL`).
- **Security.** Passwords hashed with argon2id, configuration validated at boot (fail fast, values never echoed), placeholder secrets rejected outside tests, helmet headers, per-IP rate limiting on registration, strict CSP for the SPA (no inline scripts or styles), gitleaks secret scanning and dependency audit in CI. See [SECURITY.md](./SECURITY.md).

## Repository structure

```
midas-app/
├─ apps/
│  ├─ api/          # @midas/api: Fastify backend (src/modules, src/platform, db migrations and seeds)
│  └─ web/          # @midas/web: React + Vite frontend and design system
├─ packages/
│  └─ shared/       # @midas/shared: shared Zod schemas and helpers
├─ tooling/         # shared tooling presets
├─ e2e/             # end-to-end suites (placeholder)
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

TODO: `docker compose up` has not yet been verified end to end; confirm before relying on it.

| Service                   | URL                   |
| ------------------------- | --------------------- |
| API                       | http://localhost:3000 |
| Mailpit UI (SMTP on 1025) | http://localhost:8025 |
| PostgreSQL                | localhost:5432        |

Ports are published on 127.0.0.1 only. The web dev server (below) is not part of the Compose stack. Reset local data with `docker compose down -v`.

### Run the apps in development

```bash
pnpm --filter @midas/api dev    # API with watch mode, loads ../../.env (port 3000)
pnpm --filter @midas/web dev    # Vite dev server (port 5173)
```

### Database migrations

Run from the repository root; each maps to a script in `apps/api/package.json`.

```bash
pnpm --filter @midas/api migrate          # apply pending migrations
pnpm --filter @midas/api migrate:down     # roll back
pnpm --filter @midas/api migrate:status   # show applied/pending
pnpm --filter @midas/api migrate:verify   # up, down to zero, up; checks catalogs are identical
pnpm --filter @midas/api db:codegen       # regenerate Kysely types from the database
```

## Checks and tests

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

Database-backed tests use Testcontainers, or an existing PostgreSQL 17 server when `TEST_DATABASE_URL` is set (admin URL; a throwaway database is created and dropped). They are skipped when neither is available. Use `pnpm --filter @midas/api test:watch` for watch mode.

## Environment variables

[`.env.example`](./.env.example) lists all variables with placeholders only; never commit real secrets. The API validates the variables below at boot (`apps/api/src/platform/config.ts`) and exits with a clear error when one is invalid.

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `NODE_ENV` | no | `development` | `development`, `test` or `production` |
| `HOST` | no | `0.0.0.0` | Bind address |
| `PORT` | no | `3000` | 1 to 65535 |
| `LOG_LEVEL` | no | `info` | `fatal` to `trace`, or `silent` |
| `APP_BASE_URL` | no | `http://localhost:5173` | Valid URL |
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
| `TEST_DATABASE_URL` | no | none | Tests only, see above |
| `TEST_DATABASE_IMAGE` | no | `postgres:17-bookworm` | Tests only, Testcontainers image |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `MIDAS_APP_DB_PASSWORD` | Compose | see `.env.example` | Used by the Compose database container only |
| `SMTP_HOST`, `SMTP_PORT`, `MAIL_FROM`, `MAIL_TRANSPORT` and others | no | see `.env.example` | Listed in `.env.example` for upcoming mail features; not read by the config module yet |

The web dev server also reads `VITE_DEV_HOST` (see [CONTRIBUTING.md](./CONTRIBUTING.md)).

## API

Currently available:

| Method | Path | Description |
| --- | --- | --- |
| GET | `/health` | Liveness and database readiness, reports `APP_VERSION` |
| POST | `/api/v1/auth/register` | Create an account (rate limited per IP) |

TODO: request and response shapes and an OpenAPI document are not yet published.

## Roadmap

| Sprint | Name | Focus |
| --- | --- | --- |
| 1 | Foundation | Monorepo, CI, Docker, API and web skeletons, design system, migrations, registration (in progress) |
| 2 | Core Features | Login and sessions, password reset, settings, wallets, categories, transactions, transfers |
| 3 | Secondary Features | CSV export, budgets, dashboard and reports, recurring transactions, admin |
| 4 | Quality and Release | Security hardening, accessibility, performance, deployment, documentation, v1.0 release |

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup, checks and conventions, and [SECURITY.md](./SECURITY.md) for reporting vulnerabilities.
## License

[MIT](./LICENSE) © 2026 Daryll

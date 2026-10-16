# Midas

A personal finance tracker for recording income, expenses and transfers across multiple wallets, planning spending with budgets, automating regular items, and understanding your money through a dashboard and reports.

> **Status: planning complete, development not started.**
> There is no application code in this repository yet. Everything below describing the stack, structure and setup is the **plan**, taken from the documents in [`docs/`](./docs). Commands and paths will be confirmed once the scaffold lands in Sprint 1.

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

## Planned tech stack

| Area | Choice |
| --- | --- |
| Runtime and package manager | Node.js 24 LTS, pnpm 10 workspaces (via Corepack) |
| Backend | TypeScript, Fastify 5, Zod 4, pino, OpenAPI 3.1 generated from shared schemas |
| Frontend | React 19, Vite, TanStack Router and Query, React Hook Form, Tailwind CSS v4, Radix UI, Recharts |
| Database | PostgreSQL 17, Kysely on `pg`, node-pg-migrate |
| Auth | Short-lived JWT access token (in memory), rotating httpOnly refresh cookie, argon2id |
| Mail | SMTP via nodemailer (Mailpit for local development) |
| Testing | Vitest, Testcontainers, React Testing Library, MSW, Playwright, axe |
| Delivery | Docker (single image serving API and SPA), Docker Compose for local development, GitHub Actions |

Architecture in brief: a modular monolith. One Fastify process hosts all domain modules, serves the built React SPA from the same origin, and runs the recurring-transaction scheduler. Money is stored as integer minor units. See [docs/architecture.md](./docs/architecture.md) for decisions and trade-offs.

## Planned repository structure

```
midas-app/
├─ apps/
│  ├─ api/          # @midas/api: Fastify backend (modules, platform, db migrations and seeds)
│  └─ web/          # @midas/web: React + Vite frontend
├─ packages/
│  └─ shared/       # @midas/shared: Zod schemas, money, recurrence and budget math
├─ tooling/         # shared ESLint and TypeScript presets
├─ e2e/             # Playwright specs and performance scripts
├─ infra/           # Dockerfile, production compose, deployment blueprint
├─ docs/            # architecture, API contract, database, UI design, tracker
├─ .github/         # workflows and templates
├─ compose.yaml  .env.example  package.json  pnpm-workspace.yaml
└─ README.md  LICENSE  (CONTRIBUTING.md, SECURITY.md planned)
```

Only `docs/`, this README, `LICENSE`, `.gitignore`, `.editorconfig` and `.env.example` exist today.

## Local setup (planned, not yet runnable)

The following reflects the planned workflow in [docs/architecture.md](./docs/architecture.md) sections 6 and 10. It will not work until the scaffold is implemented.

Prerequisites (planned): Node.js 24, Corepack, Docker with Compose.

```bash
corepack enable                 # once per machine
pnpm install                    # install all workspaces
cp .env.example .env            # then adjust placeholders
docker compose up               # db, mailpit, api (3000), web (5173)
```

Planned commands:

```bash
pnpm dev                              # api and web in parallel
pnpm --filter @midas/api dev          # api only
pnpm --filter @midas/web dev          # web only
pnpm lint && pnpm typecheck
pnpm test                             # unit tests
pnpm test:integration                 # API integration tests (Testcontainers)
pnpm test:e2e                         # Playwright against the compose stack
pnpm build
pnpm --filter @midas/api cli migrate
pnpm --filter @midas/api cli seed:dev
pnpm --filter @midas/api cli admin:create --email you@example.com
```

Local services (planned): web on `http://localhost:5173`, API on `http://localhost:3000`, Mailpit UI on `http://localhost:8025`. Reset local data with `docker compose down -v`.

### Environment variables

[`.env.example`](./.env.example) lists every planned variable with placeholder values only. Never commit real secrets; the app is planned to validate configuration at boot and fail fast when a required value is missing.

## Roadmap

Four sprints, 80 stories, 308 points. Progress is tracked in [docs/dev-stories-tracker.md](./docs/dev-stories-tracker.md).

| Sprint | Name | Focus |
| --- | --- | --- |
| 1 | Foundation | Architecture decisions, repository, CI, Docker, app skeletons, design system, auth schema and registration |
| 2 | Core Features | Login and sessions, password reset, settings, wallets, categories, transactions, transfers |
| 3 | Secondary Features | CSV export, budgets, dashboard and reports, recurring transactions, admin |
| 4 | Quality and Release | Security hardening, code review, QA, accessibility, performance, deployment, documentation, v1.0 release |

Current state: design, architecture, API contract and database design are written; no stories are Done.

## Documentation

- [Architecture](./docs/architecture.md): stack, domain policies, security, deployment, testing, ADRs
- [Database design](./docs/database.md): PostgreSQL schema, migrations, seeds, environment variables
- [API contract](./docs/api-contract.md): REST endpoints and conventions
- [UI design](./docs/ui-design.md): design system, tokens, screens
- [Project brief](./docs/project-brief.md)
- [Dev stories tracker](./docs/dev-stories-tracker.md): backlog and sprint plan

## Contributing

Contribution guidelines (`CONTRIBUTING.md`) and a security policy (`SECURITY.md`) are planned for Sprint 1. Until then, please open an issue before starting work.

## License

[MIT](./LICENSE) © 2026 Daryll

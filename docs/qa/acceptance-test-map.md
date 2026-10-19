# Acceptance criteria to tests (map by epic)

- **Story:** E10-F2-S1
- **Date:** 2026-10-19
- **Source of truth for the criteria:** `docs/dev-stories-tracker.md` (each story's QA note names the tests that
  exercise its criteria). This table is the index; open the named files for the per-criterion detail.

## Where tests live

| Short name | Location | Runs with |
| --- | --- | --- |
| shared | `packages/shared/src/*.test.ts` | `pnpm --filter @midas/shared test` |
| api unit | `apps/api/src/**/*.test.ts` (fake clock, fake mailer, `inject`) | `pnpm --filter @midas/api test` |
| api int | `apps/api/test/api/*.int.test.ts` (Fastify `inject` on real PostgreSQL 17) | same (Testcontainers or `TEST_DATABASE_URL`) |
| api db | `apps/api/test/db/*.int.test.ts` (migrations, schema, constraints, triggers) | same |
| web | `apps/web/src/**/*.test.ts(x)` (Testing Library, `vitest-axe`) | `pnpm --filter @midas/web test` |
| e2e | `e2e/tests/*.spec.ts` (Playwright; mocked API unless `real-api`) | `pnpm test:e2e` |
| perf | `apps/api/test/perf/*.perf.ts` | `pnpm --filter @midas/api test:perf` (not in the default run) |

Stories with no code test are design, documentation or infrastructure stories, checked by review or CI (last section).

## Coverage thresholds (enforced in CI)

CI step "Unit and integration tests with coverage thresholds" runs `pnpm test:coverage` (V8 provider,
`@vitest/coverage-v8` 5.0.5, matching Vitest). A threshold miss fails the job. Floors sit a few points under the measured
values, so a real drop fails and small edits do not flake. Architecture section 11 sets the targets: 95% lines for
`packages/shared`, 80% overall for the API (85% for auth, transactions, transfers, budgets and recurring), 80% lines for
the web app.

| Package | Measured 2026-10-19 (lines / statements / branches / functions) | Enforced floor (lines / statements / branches / functions) | Architecture target |
| --- | --- | --- | --- |
| `packages/shared` | 96.6 / 95.7 / 90.7 / 90.1 | 95 / 94 / 87 / 87 | 95% lines: met |
| `apps/web` | 88.2 / 86.7 / 78.1 / 83.4 | 85 / 83 / 74 / 80 | 80% lines: met |
| `apps/api` | 93.4 / 91.3 / 85.0 / 95.0 | 90 / 88 / 80 / 92; lines per module: auth 95, transactions 95, transfers 95, budgets 90, recurring 88 | 80% overall and 85% lines for the five modules: met (measured lines: auth 99.2, transactions 99.2, transfers 100, budgets 95.0, recurring 91.6) |

Excluded from API coverage: `*.test.ts`, the generated database types and `src/server.ts` (process entry point; the
production-image CI job starts it). Coverage was measured over the same run as the tests, with Testcontainers
PostgreSQL 17 (891 API tests). Run it locally with `pnpm test:coverage` from the repository root.

## Money and permission logic

| Area | Tests |
| --- | --- |
| Money arithmetic, rounding, currency exponents, minor units | shared `money.test.ts`, `currency.test.ts`, `transactions.test.ts`, `budget-math.test.ts`; web `lib/money.test.ts`, `lib/money-input.test.ts`, `reports/trend-format.test.ts` |
| Ledger correctness (balances equal the sum of signed amounts after every API test) | api int `transactions.int.test.ts`, `transfers.int.test.ts`, `ledger-concurrency.int.test.ts`, `wallets.int.test.ts`, `category-delete-race.int.test.ts` (each asserts `expectLedgerConsistent`); api db `ledger-schema.int.test.ts` |
| Budget and report money math | shared `budget-math.test.ts`; api int `budgets.int.test.ts`, `reports.int.test.ts` |
| Authentication required on every route; exact public allowlist | api int `route-auth-table.int.test.ts` (enumerates the route table), `guard.int.test.ts` |
| Role checks (every `/api/v1/admin` route returns 403 for a user) | api int `route-auth-table.int.test.ts`, `admin-users-actions.int.test.ts`, `admin-last-admin.int.test.ts` |
| Ownership and IDOR (another user's wallet, category, transaction, transfer, budget, template, report, export) | api int `security.int.test.ts`, `security-sprint3.int.test.ts`, `security-sprint3-qa.int.test.ts`; resource suites `wallets`, `categories`, `transactions`, `transfers`, `budgets`, `recurring`, `export`, `reports` |
| Admin has no access to private financial data | api int `admin-privacy.int.test.ts`; api unit `admin-privacy.test.ts`; web `admin-pages.test.tsx`; e2e `admin.spec.ts` |
| Tokens: expired, tampered, `alg: none`, reuse of a refresh token | api unit `tokens.test.ts`, `guard.test.ts`, `session-routes.test.ts`; api int `security.int.test.ts`, `security-sprint3.int.test.ts`; e2e `real-api.spec.ts` |

## Security tests by attack scenario

| Scenario | Tests |
| --- | --- |
| Unauthenticated request to a protected endpoint gets 401 | `route-auth-table.int.test.ts` (all routes), `security-sprint3-qa.int.test.ts` |
| Another user's resource is refused (IDOR) | `security.int.test.ts`, `security-sprint3.int.test.ts` |
| Expired, tampered, `alg: none` or missing token rejected | `security.int.test.ts`, `security-sprint3.int.test.ts` (nine routes with an expired token in `security-sprint3-qa.int.test.ts`) |
| Wrong role gets 403 | `route-auth-table.int.test.ts`, `admin-users.int.test.ts` |
| Length limits and schema violations return 400, never 5xx | `input-validation-audit.int.test.ts` (every route), `security-sprint3-qa.int.test.ts` |
| SQL metacharacters and `UNION` in strings | `security.int.test.ts` |
| Prototype pollution in JSON bodies | `security.int.test.ts`, `security-sprint3.int.test.ts`, `security-sprint3-qa.int.test.ts` |
| Brute force triggers 429 with a retry hint | `security.int.test.ts`, `rate-limits.test.ts`, `rate-limits-sprint3.int.test.ts`, `hardening.test.ts` |
| Errors are generic (no stack, SQL or paths) | `routes.security.test.ts`, `security.int.test.ts`, `errors.test.ts`, `logging.test.ts` |
| Security headers, CSP, CORS | `hardening.test.ts`, `cors.test.ts`, `web.test.ts`, e2e `csp.spec.ts` |
| Open redirect after sign-in rejected | web `redirect.test.ts`, `session-guard.test.tsx`; e2e `auth.spec.ts` ("refuses an open redirect") |
| Path traversal when serving the SPA | `web.test.ts` |

## Stories to tests

Epic 1: Foundations

| Story | Tests |
| --- | --- |
| E1-F1-S3 Domain model and API contract | api unit `openapi.test.ts`, `openapi-shapes.test.ts` (route sync and shapes) |
| E1-F2-S1 Backend skeleton | api unit `config.test.ts`, `app.test.ts`, `routes.test.ts`, `routes.security.test.ts` |
| E1-F2-S2 Frontend skeleton | web `app/routing.test.tsx`, `build-guard.test.ts`, `csp.test.ts`, `app/shell/app-shell.test.tsx` |
| E1-F2-S3 Migration framework | api db `migrations.int.test.ts`; api unit `cli-args.test.ts` |
| E1-F4-S1 Design system and tokens | web `components/ui/ui.test.tsx`, `app/theme-provider.test.tsx`, `styles/contrast.test.ts` |
| E1-F4-S2 App shell | web `app/shell/app-shell.test.tsx`, `responsive-nav.test.tsx` |

Epic 2: Auth, settings

| Story | Tests |
| --- | --- |
| E2-F1-S1 Users, sessions, reset tokens schema | api db `migrations.int.test.ts`, `register.int.test.ts`, `session-settings.int.test.ts` |
| E2-F2-S1 Registration API | api int `auth.int.test.ts`, `categories.int.test.ts`; api unit `routes.test.ts`, `service.test.ts` |
| E2-F2-S2 Login, logout, refresh | api int `auth.int.test.ts`, `security.int.test.ts`; api unit `session-routes.test.ts` |
| E2-F2-S3 Register and login UI | web `auth-pages.test.tsx`, `register-reset.test.tsx`; e2e `auth.spec.ts`, `real-api.spec.ts` |
| E2-F2-S4 Session handling, guards | web `session-guard.test.tsx`, `api-client.test.ts`, `redirect.test.ts` |
| E2-F3-S1 Password reset API | api int `password.int.test.ts`, `security.int.test.ts`; api unit `mailer.test.ts` |
| E2-F3-S2 Password reset UI | web `register-reset.test.tsx`, `reset-token.test.ts`; e2e `real-api.spec.ts` |
| E2-F4-S1 Profile and settings API | api int `profile.int.test.ts`, `security.int.test.ts` |
| E2-F4-S2 Settings UI | web `settings.test.tsx` |

Epic 3: Wallets and transfers

| Story | Tests |
| --- | --- |
| E3-F1-S1 Wallets schema | api db `ledger-schema.int.test.ts`, `migrations.int.test.ts` |
| E3-F1-S3 Wallet CRUD and archive API | api int `wallets.int.test.ts`, `security.int.test.ts` |
| E3-F1-S4 Wallets UI | web `wallets-page.test.tsx`, `wallet-form.test.ts`; e2e `wallets.spec.ts` |
| E3-F2-S1 Wallet transfer API | api int `transfers.int.test.ts`, `ledger-concurrency.int.test.ts` |
| E3-F2-S2 Transfer UI | web `composer.test.tsx`, `transfer-form.test.ts` |

Epic 4: Categories

| Story | Tests |
| --- | --- |
| E4-F1-S1 Schema and default seed | api db `ledger-schema.int.test.ts`, `system-categories.int.test.ts` |
| E4-F1-S2 Icons and colors | web `categories-page.test.tsx`, `category-chip.test.tsx`; shared `category-icon-meta.test.ts` |
| E4-F1-S3 Category API | api int `categories.int.test.ts`, `category-delete-race.int.test.ts` |
| E4-F1-S4 Category UI | web `categories-page.test.tsx`, `category-form.test.ts` |

Epic 5: Transactions and export

| Story | Tests |
| --- | --- |
| E5-F1-S1 Schema and indexes | api db `ledger-schema.int.test.ts` |
| E5-F1-S2 List and form design | web `composer.test.tsx`, `transactions-page.test.tsx` |
| E5-F2-S1 Create, edit, delete API | api int `transactions.int.test.ts`, `security.int.test.ts` |
| E5-F2-S2 List, search, filter API | api int `transactions-list.int.test.ts`, `transactions-explain.int.test.ts` (index use) |
| E5-F2-S3 Transaction form UI | web `composer.test.tsx`, `transaction-form.test.ts` |
| E5-F2-S4 List UI with filters | web `transactions-page.test.tsx`, `filters.test.ts`; e2e `transactions.spec.ts` |
| E5-F3-S1 CSV export API | api unit `csv.test.ts`, `export.test.ts`; api int `export.int.test.ts`, `export-stream.int.test.ts`, `export-limits.int.test.ts` |
| E5-F3-S2 Export button UI | web `export-button.test.tsx`; e2e `export.spec.ts` |

Epic 6: Budgets

| Story | Tests |
| --- | --- |
| E6-F1-S1 Schema | api db `planning-audit-schema.int.test.ts`, `enum-parity.int.test.ts` |
| E6-F1-S3 Budget CRUD and progress API | api int `budgets.int.test.ts`, `rate-limits-sprint3.int.test.ts`, `security-sprint3-qa.int.test.ts` |
| E6-F1-S4 Overspend logic | shared `budget-math.test.ts`; api int `budgets.int.test.ts` |
| E6-F1-S5 Budgets UI | web `budgets-page.test.tsx`, `budget-form.test.ts`; e2e `budgets.spec.ts`, `real-api.spec.ts` |
| E6-F1-S6 Warnings UI | web `budget-state.test.ts`, `dashboard-page.test.tsx`; e2e `dashboard-responsive.spec.ts` |

Epic 7: Reports and dashboard

| Story | Tests |
| --- | --- |
| E7-F1-S1 Summary API | api int `reports.int.test.ts`, `reports-explain.int.test.ts`, `rate-limits-sprint3.int.test.ts` |
| E7-F1-S2 Trend API | api unit `buckets.test.ts`; api int `reports.int.test.ts`, `reports-explain.int.test.ts` |
| E7-F1-S3 Category breakdown API | api int `reports.int.test.ts`, `security-sprint3-qa.int.test.ts` |
| E7-F2-S2 Dashboard summary UI | web `dashboard-page.test.tsx`; e2e `dashboard.spec.ts`, `real-api.spec.ts` |
| E7-F2-S3 Charts UI | web `trend-chart.test.tsx`, `trend-format.test.ts`, `theme-tokens.test.ts`; e2e `csp.spec.ts`, `dashboard-responsive.spec.ts` |
| E7-F2-S4 Date-range selector | web `range.test.ts`, `dashboard-range.test.tsx`, `reports-page.test.tsx` |

Epic 8: Recurring

| Story | Tests |
| --- | --- |
| E8-F1-S1 Schema | api db `planning-audit-schema.int.test.ts` |
| E8-F1-S3 Templates API | api int `recurring.int.test.ts`, `recurring-more.int.test.ts`; shared `recurrence.test.ts` |
| E8-F1-S4 Scheduled generation | api unit `scheduler.test.ts`; api int `recurring-generator*.int.test.ts`, `scheduler-jobs.int.test.ts` |
| E8-F1-S5 Recurring UI | web `recurring-page.test.tsx`, `recurring-form.test.ts`, `recurring-edit.test.tsx`; e2e `recurring.spec.ts`, `real-api.spec.ts` |

Epic 9: Admin and audit

| Story | Tests |
| --- | --- |
| E9-F1-S1 Audit and role schema | api db `planning-audit-schema.int.test.ts`, `migrations.int.test.ts` |
| E9-F1-S2 Audit service and query API | api int `audit-query.int.test.ts`, `audit-events.int.test.ts`, `audit-events-password.int.test.ts`; api unit `cursor.test.ts`, `metadata.test.ts` |
| E9-F2-S2 User management API | api int `admin-users.int.test.ts`, `admin-users-actions.int.test.ts`, `admin-last-admin.int.test.ts`, `admin-privacy.int.test.ts`, `admin-bootstrap*.int.test.ts` |
| E9-F2-S3 User management UI | web `admin-pages.test.tsx`, `admin-qa.test.tsx`; e2e `admin.spec.ts` |
| E9-F3-S1 Default category API | api int `admin-categories.int.test.ts`, `admin-categories-lifecycle.int.test.ts` |
| E9-F3-S2 Platform metrics API | api int `admin-metrics.int.test.ts`; api unit `ops/routes.test.ts`, `metrics.test.ts` |
| E9-F3-S3 Admin categories and metrics UI | web `admin-pages.test.tsx`, `admin-categories-audit.test.tsx`, `admin-qa.test.tsx` |
| E9-F3-S4 Audit log UI | web `admin-categories-audit.test.tsx`, `audit-search.test.ts`, `admin-qa.test.tsx` |

Epic 10: Hardening and release

| Story | Criterion | Tests |
| --- | --- | --- |
| E10-F1-S1 Rate limiting | Limits on login, register, reset | api unit `hardening.test.ts` (login, register, forgot and reset each return 429 at the configured maximum), `rate-limits.test.ts` (per account, per IP, IPv6 /64, refresh); api int `security.int.test.ts` (reset-token guessing, refresh, per-user caps), `rate-limits-sprint3.int.test.ts` |
| | 429 with retry hints | api unit `hardening.test.ts` ("Retry-After and RateLimit headers agree" on login, register, forgot, reset) |
| | Configurable and tested | `hardening.test.ts` ("limits are tunable"); api unit `config.test.ts` (`RATE_LIMIT_*`, refused off in production) |
| E10-F1-S2 Headers, CORS, input | CSP and security headers | api unit `hardening.test.ts`, `web.test.ts`; e2e `csp.spec.ts` (served build, real CSP); web `csp.test.ts` |
| | CORS restricted by config | api unit `cors.test.ts`, `hardening.test.ts` |
| | Input validation on every endpoint | api int `input-validation-audit.int.test.ts` (route table: bad path params, unknown fields, wrong types, unknown query), `route-auth-table.int.test.ts` |
| E10-F1-S3 Backend review | Authorization on every endpoint | api int `route-auth-table.int.test.ts` |
| E10-F1-S4 Frontend review | No unsafe HTML, token storage | web `csp.test.ts`; e2e `auth.spec.ts` ("keeps the access token out of web storage"), `real-api.spec.ts` |
| E10-F2-S1 Coverage | Threshold in CI; money and permission | this file; `vitest.config.ts` / `vite.config.ts` thresholds; `.github/workflows/ci.yml` |
| E10-F2-S2 E2E suite | Seven journeys | e2e `auth.spec.ts`, `real-api.spec.ts` (register); `wallets.spec.ts`; `transactions.spec.ts`; `budgets.spec.ts`; `dashboard.spec.ts`; `recurring.spec.ts`; `admin.spec.ts`; real-API journey for budget, dashboard and recurring in `real-api.spec.ts` |
| E10-F2-S3 Accessibility | Automated and keyboard; contrast | e2e `a11y.spec.ts`, `keyboard.spec.ts`; web `styles/contrast.test.ts`; `docs/qa/accessibility-audit.md` |
| E10-F2-S4 Performance | Large dataset, thresholds | api perf `list-reports.perf.ts`; `docs/qa/performance-baseline.md` |
| E10-F3-S1 Observability | Request ids in logs | api unit `hardening.test.ts` ("request logs carry correlation ids"), `logging.test.ts` |
| | `/metrics` protected | api unit `ops/routes.test.ts` (404 without token configured, 401 on wrong or missing token, no query token, rate limited), `metrics.test.ts` |
| | Runbook | `docs/operations/troubleshoot-api.md` (log and metric names asserted by the tests above) |
| E10-F3-S2 Deployment | Image builds in CI | `.github/workflows/ci.yml` job `production-image` (build, smoke, Playwright on the image); verified locally with `docker build` |

## Stories with no automated code test (verified another way)

| Story | How it is verified |
| --- | --- |
| E1-F1-S1 ADRs, E1-F1-S2 scaffold, E1-F4-S3 docs skeleton | Files and links reviewed in the Sprint 1 gate |
| E1-F3-S1 Docker Compose | Stack run with Docker, healthy (Sprint 1 carry-over QA) |
| E1-F3-S2 CI, E1-F3-S3 secret scan and audit | CI run on a pull request (5 required checks) |
| E1-F4-S2, E2-F1-S2, E6-F1-S2, E7-F2-S1, E8-F1-S2, E9-F2-S1 design stories | Reviewed against `docs/ui-design.md` |
| E10-F3-S3 to E10-F3-S5 docs and release | Not yet QA'd (docs-agent and readme-agent own them) |

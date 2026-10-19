# Midas Specifications

**Version:** 1.3
**Date:** 2026-10-19
**Status:** Active (Sprints 1 to 3 implemented; Sprint 4 hardening and release in progress; v1.0 is not declared ready)
**Owner:** docs-agent

Related documents: [Project brief](./project-brief.md) · [Architecture](./architecture.md) · [API contract](./api-contract.md) · [Database design](./database.md) · [UI and UX design](./ui-design.md) · [User guide](./user-guide.md) · [API reference](./api/README.md) · [Security and code reviews](./reviews/sprint-4-backend-security-review.md) · [QA reports](./qa/acceptance-test-map.md) · [Deployment guide](./operations/deployment.md) · [Docs index](./README.md)

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Goals and Success Metrics](#2-goals-and-success-metrics)
3. [User Personas](#3-user-personas)
4. [Functional Requirements](#4-functional-requirements)
5. [Non-Functional Requirements](#5-non-functional-requirements)
6. [Tech Stack and Architecture](#6-tech-stack-and-architecture)
7. [Constraints and Assumptions](#7-constraints-and-assumptions)
8. [Out of Scope](#8-out-of-scope)
9. [Glossary](#9-glossary)
10. [Revision History](#10-revision-history)

---

## 1. Project Overview

**Description.** Midas is a personal finance web application. People record income, expenses and transfers across multiple wallets, organize them with categories, plan spending with budgets, automate regular items with recurring templates, and review balances, trends and spending on a dashboard. Operators run the platform through an admin area that has no access to users' private financial records. The codebase is public and intended to be a reference-quality example of architecture, testing, accessibility and security practice.

**Problem statement.** Individuals struggle to see where their money goes and to stay within a plan. Spreadsheets are error-prone and tedious, and many tools are either too heavy or handle money with rounding errors and weak privacy.

**Solution summary.** A single deployable web application with exact integer money handling, strict per-user data isolation, a clear dashboard, budgets with early warnings, recurring automation, CSV export, and an audited admin area. Details of how this is built are in [architecture.md](./architecture.md).

---

## 2. Goals and Success Metrics

| Goal | Success metric | Target |
| --- | --- | --- |
| Users can record and find money movements quickly | Time to add a transaction from the dashboard (quick-add) | Under 15 seconds, measured in E2E |
| Users understand their finances | Dashboard summary and charts for a user with 100k transactions | API p95 under 300 ms, LCP under 2.5 s on mid-range mobile |
| Money is always correct | Wallet balance equals opening balance plus transaction effects; no duplicated or lost generated transactions | 0 invariant violations in integration, E2E and perf suites |
| Accounts are secure | Open high or critical findings from review, dependency audit, secret scan and CodeQL | 0 open at release |
| Admins can operate without seeing private data | Admin routes that expose another user's financial records | 0 (verified by route-enumeration tests) |
| Product is accessible | WCAG 2.1 AA automated and manual checks, both themes | 0 serious or critical axe violations |
| Codebase is demonstrably professional | Coverage gates enforced in CI | Shared 95%, auth/transactions/transfers/budgets/recurring 85%, API overall 80%, web 80% |
| Project is easy to run and deploy | Clone to running stack; deploy path | `docker compose up` in minutes; documented one-click-style deployment |
| Delivery is predictable | Stories marked Done by QA at release | 80 of 80 Done, or deferred with written rationale |

**Measured status (2026-10-19).** Performance: the 100,000-transaction baseline is within every target (section 5, NFR-P-1; [performance baseline](./qa/performance-baseline.md)). Security: no Critical or High review finding is open; the backend and frontend review outcomes are recorded in [docs/reviews](./reviews/sprint-4-backend-security-review.md). Accessibility: axe reports 0 violations on 17 routes in both themes, but manual screen-reader testing has NOT been performed, so the accessibility goal is not yet fully met ([accessibility audit](./qa/accessibility-audit.md)). CodeQL and the first observed CI run of the production-image job are not yet in place (see section 5).

---

## 3. User Personas

### 3.1 User (Everyday Tracker)

- **Role:** Individual who manages personal finances. Role value `user`.
- **Goals:** Record income and expenses across several wallets; see balances and where money goes; stay within monthly budgets; automate bills and salary; export data; keep data private.
- **Pain points:** Manual, slow data entry; unclear totals across accounts; overspending noticed too late; fear of data exposure; cluttered or inaccessible interfaces.
- **Key actions:** Register and sign in; create wallets and categories; add, edit, search and export transactions; transfer between wallets; set budgets and read warnings; configure recurring templates; review the dashboard; change currency, locale, timezone and theme; reset a forgotten password.

### 3.2 Admin (Platform Operator)

- **Role:** Operator of a Midas deployment. Role value `admin`. An admin can do everything a user can for their own data, plus admin tasks.
- **Goals:** Keep the platform healthy and trustworthy; handle account issues; maintain good default categories; review accountability.
- **Pain points:** Needing to investigate problems without being able to see private data; risk of locking out all admins; lack of an audit trail.
- **Key actions:** Create the first admin via CLI; list, search, suspend, reactivate and change roles of users; manage system categories; view platform-wide aggregate metrics; browse the audit log.
- **Boundary:** Admins cannot read, aggregate per user, or export other users' transactions, wallets, budgets or templates (ADR-018).

---

## 4. Functional Requirements

Requirement IDs use `REQ-<epic>.<feature>.<seq>`. Epic and feature numbers follow the project backlog. The Notes column cites the source story. Endpoint details are in [api-contract.md](./api-contract.md), schema details in [database.md](./database.md), and screens in [ui-design.md](./ui-design.md).

**Priority mapping.** Sprint 1 and 2 stories are Must Have (core, launch-blocking). Sprint 3 stories are Should Have. Sprint 4 hardening and release stories are Must Have because they gate release. Could Have is unused in v1.

**Implementation status (as of 2026-10-19; Epics 1 to 9 implemented, Epic 10 in progress).** Implemented in code: registration, login, logout, refresh and password reset (REQ-2.2.x, 2.3.x); profile and settings (REQ-2.4.x); wallets (REQ-3.1.x); transfers (REQ-3.2.x); categories (REQ-4.1.x); transaction CRUD, search and the transaction UI (REQ-5.1.x, 5.2.x); CSV export (REQ-5.3.x); budgets and overspend warnings (Epic 6); dashboard and reports (Epic 7); recurring transactions (Epic 8); and the admin area with audit log (Epic 9). Known gaps: audit and recurring-run retention purge jobs, the post-transaction budget toast, and a dedicated worker process are not built. Epic 10 hardening is in progress (see the status notes on each Epic 10 requirement below), building on rate limiting, the strict CSP and the ledger triggers that existed as Sprint 2 groundwork (REQ-2.2.9, REQ-2.2.10, REQ-5.1.3). Per-story state is tracked in the project backlog; requirements below are not individually status-tagged.

**Done in Sprint 4.** The API serves the built SPA from its own origin in the production image, and a CI job runs Playwright against that image under the real CSP. The local Compose stack still uses the Vite dev server for hot reload.

**Epic 10 status (2026-10-19, from the project backlog).** QA gate Done and Pass: E10-F1-S1, E10-F1-S2, E10-F2-S1, E10-F2-S2, E10-F2-S4, E10-F3-S1, E10-F3-S2. Open: E10-F1-S3 and E10-F1-S4 (review outcomes now recorded in the repository; awaiting QA), E10-F2-S3 (automated, keyboard and contrast checks pass; manual screen-reader testing not performed), E10-F3-S3 (API reference and user guide written; awaiting QA), E10-F3-S4 and E10-F3-S5.

### Epic 1: Foundations (Repository, CI, Docker, Docs)

#### Feature 1.1: Architecture and Repository

| ID | Requirement | Priority | Notes |
| --- | --- | --- | --- |
| REQ-1.1.1 | An ADR covers frontend, backend, database, auth approach, job scheduling and deployment target, with trade-offs and rejected alternatives, committed under `docs/adr/`. | Must Have | E1-F1-S1 |
| REQ-1.1.2 | The repository has an apps/docs/infra layout, no committed secrets, lint/format/editor config, CONTRIBUTING, LICENSE, SECURITY and PR/issue templates. | Must Have | E1-F1-S2 |
| REQ-1.1.3 | A domain model with money and currency rules, an OpenAPI spec for all in-scope epics, and error, pagination and auth conventions are defined. | Must Have | E1-F1-S3 |

#### Feature 1.2: Application Skeletons

| ID | Requirement | Priority | Notes |
| --- | --- | --- | --- |
| REQ-1.2.1 | The backend boots from validated environment config and exposes `GET /health` reporting liveness and database readiness. | Must Have | E1-F2-S1 |
| REQ-1.2.2 | Backend errors follow the documented error format and are logged with request IDs; a unit test runner runs at least one passing test. | Must Have | E1-F2-S1 |
| REQ-1.2.3 | The frontend has public and protected route placeholders, a typed API client (base URL, errors, token attachment), a persisted light/dark theme toggle, and a component test runner. | Must Have | E1-F2-S2 |
| REQ-1.2.4 | Migrations run up and down against a local database; naming, id, timestamp and money-column conventions are documented; seeds are separate from migrations. | Must Have | E1-F2-S3 |

#### Feature 1.3: CI/CD and Docker

| ID | Requirement | Priority | Notes |
| --- | --- | --- | --- |
| REQ-1.3.1 | `docker compose up` starts database, backend and frontend with hot reload; an example env file documents all variables with no real secrets; volumes persist data and a reset command is documented. | Must Have | E1-F3-S1 |
| REQ-1.3.2 | CI runs lint, unit tests and build for backend and frontend on every pull request, blocks merge on failure, and caches dependencies. | Must Have | E1-F3-S2 |
| REQ-1.3.3 | Secret scanning runs on every PR and push; dependency audit fails on high or critical findings; an allowlist process is documented. | Must Have | E1-F3-S3 |

#### Feature 1.4: Design System and Docs Skeleton

| ID | Requirement | Priority | Notes |
| --- | --- | --- | --- |
| REQ-1.4.1 | Color, type and spacing tokens exist for light and dark themes; core components specify states with WCAG 2.1 AA contrast; responsive breakpoints are documented. | Must Have | E1-F4-S1 |
| REQ-1.4.2 | Desktop and mobile navigation, empty/loading/error states and an admin navigation variant are specified. | Must Have | E1-F4-S2 |
| REQ-1.4.3 | A docs folder structure and index exist, with ADR and runbook templates, and documentation reads as a standalone product. | Must Have | E1-F4-S3 |

### Epic 2: Authentication and Accounts

#### Feature 2.1: Auth Data and Design

| ID | Requirement | Priority | Notes |
| --- | --- | --- | --- |
| REQ-2.1.1 | Schema stores users (role, status, currency, locale, theme), sessions and reset tokens, with a unique email index, token expiry columns and a tested rollback. | Must Have | E2-F1-S1 |
| REQ-2.1.2 | Designs exist for register, login, forgot/reset password and settings, with validation messaging and keyboard/screen-reader behaviour. | Must Have | E2-F1-S2 |

#### Feature 2.2: Registration, Login and Sessions

| ID | Requirement | Priority | Notes |
| --- | --- | --- | --- |
| REQ-2.2.1 | A visitor can register with email and password; passwords are hashed with a modern adaptive algorithm. | Must Have | E2-F2-S1 |
| REQ-2.2.2 | Duplicate email and weak password return validation errors. | Must Have | E2-F2-S1 |
| REQ-2.2.3 | New users receive default settings and have default categories available; success and failure paths are tested. | Must Have | E2-F2-S1 |
| REQ-2.2.4 | Login issues a short-lived access credential and a rotating refresh credential; logout revokes the session. The refresh token format is `<sid>.<random>`, where `sid` identifies the session and only a hash of the random part is stored. | Must Have | E2-F2-S2 |
| REQ-2.2.5 | Suspended users cannot log in; failed-login responses do not reveal whether the email exists. | Must Have | E2-F2-S2 |
| REQ-2.2.6 | Register and login forms validate client-side, show server errors, route to the dashboard on success, and are keyboard accessible with labelled inputs. | Must Have | E2-F2-S3 |
| REQ-2.2.7 | Expired access credentials refresh transparently; logout clears client state; unauthenticated access redirects to login and returns after sign-in. | Must Have | E2-F2-S4 |
| REQ-2.2.8 | Each refresh rotates the refresh token; presenting an already-rotated token (reuse) revokes the whole session. | Must Have | E2-F2-S2; added in Sprint 2 update |
| REQ-2.2.9 | Auth endpoints (register, login, refresh, forgot and reset password) are rate limited and return a stable error when the limit is exceeded. | Must Have | E2-F2-S2; groundwork for E10-F1-S1 |
| REQ-2.2.10 | The SPA works under a strict Content Security Policy with no inline scripts or styles; selects and radio groups use native elements rather than portal-based widgets. | Must Have | E2-F2-S3; Sprint 2 decision |

#### Feature 2.3: Password Reset

| ID | Requirement | Priority | Notes |
| --- | --- | --- | --- |
| REQ-2.3.1 | Reset tokens are single-use, expiring and stored hashed. | Must Have | E2-F3-S1 |
| REQ-2.3.2 | The reset request response is identical for known and unknown emails. | Must Have | E2-F3-S1 |
| REQ-2.3.3 | A successful reset revokes existing sessions; email sending is abstracted with a local dev mail sink. | Must Have | E2-F3-S1 |
| REQ-2.3.4 | Forgot and reset screens work end to end, handle expired or invalid tokens, and present accessible success and error messages. | Must Have | E2-F3-S2 |

#### Feature 2.4: Profile and Settings

| ID | Requirement | Priority | Notes |
| --- | --- | --- | --- |
| REQ-2.4.1 | Profile can be read and updated (name, currency, locale, timezone, theme) with value validation; preferences are returned on login. | Must Have | E2-F4-S1 |
| REQ-2.4.2 | Password change requires the current password. | Must Have | E2-F4-S1 |
| REQ-2.4.3 | The settings page saves profile, password and preferences; theme changes apply immediately and persist; currency and locale changes affect formatting. | Must Have | E2-F4-S2 |

### Epic 3: Wallets

#### Feature 3.1: Wallet Management

| ID | Requirement | Priority | Notes |
| --- | --- | --- | --- |
| REQ-3.1.1 | Wallets support cash, bank, card and savings types, store money as integer minor units with a currency code, and have an archived flag with per-user indexes. | Must Have | E3-F1-S1 |
| REQ-3.1.2 | Designs cover wallet list, create/edit, archive confirmation, balance display, negative-balance styling and mobile layout. | Must Have | E3-F1-S2 |
| REQ-3.1.3 | Users can create, edit, archive and list only their own wallets. | Must Have | E3-F1-S3 |
| REQ-3.1.4 | Wallet balance is the opening balance plus transaction effects. | Must Have | E3-F1-S3 |
| REQ-3.1.5 | Archived wallets are hidden by default and reject new transactions; validation and tests cover all endpoints. | Must Have | E3-F1-S3 |
| REQ-3.1.6 | The wallets UI lists type, balance and an archived toggle, validates the create/edit form, and requires confirmation to archive. | Must Have | E3-F1-S4 |

#### Feature 3.2: Transfers

| ID | Requirement | Priority | Notes |
| --- | --- | --- | --- |
| REQ-3.2.1 | A transfer atomically debits one wallet and credits another. | Must Have | E3-F2-S1 |
| REQ-3.2.2 | Same-wallet, archived-wallet and cross-user transfers are rejected. | Must Have | E3-F2-S1 |
| REQ-3.2.3 | Cross-currency transfers require an explicit destination amount (`toAmountMinor`) per ADR-008, with no automatic conversion; transfers appear as two linked transactions and both legs are edited and deleted together. | Must Have | E3-F2-S1 |
| REQ-3.2.4 | The transfer form selects source and destination wallets, shows validation errors and refreshes balances after success. | Must Have | E3-F2-S2 |

### Epic 4: Categories

#### Feature 4.1: Category Management

| ID | Requirement | Priority | Notes |
| --- | --- | --- | --- |
| REQ-4.1.1 | Categories support income and expense types, are scoped by owner, and system categories are seeded idempotently. | Must Have | E4-F1-S1 |
| REQ-4.1.2 | An icon and color palette with accessible contrast, picker interaction and a system-versus-custom distinction are specified. | Must Have | E4-F1-S2 |
| REQ-4.1.3 | Users can list defaults and create, edit and delete their own categories; system categories are read-only to users. | Must Have | E4-F1-S3 |
| REQ-4.1.4 | Deleting a used category requires reassignment or is rejected; name uniqueness per user and type is enforced. | Must Have | E4-F1-S3 |
| REQ-4.1.5 | The category UI separates income and expense, offers icon and color pickers, and handles deletion of in-use categories. | Must Have | E4-F1-S4 |

### Epic 5: Transactions

#### Feature 5.1: Transaction Data and Design

| ID | Requirement | Priority | Notes |
| --- | --- | --- | --- |
| REQ-5.1.1 | Transactions support income, expense and transfer types, are indexed for filtering by user, date, wallet and category, and constraints prevent negative amounts and orphaned links. | Must Have | E5-F1-S1 |
| REQ-5.1.2 | Designs cover quick-add and full forms, filter/search/pagination patterns, and empty and error states. | Must Have | E5-F1-S2 |
| REQ-5.1.3 | Database triggers maintain the wallet ledger (balance effects of inserts, updates and deletes) so balances stay consistent under concurrent writes. | Must Have | E5-F1-S1; Sprint 2 implementation |

#### Feature 5.2: Transaction CRUD and Search

| ID | Requirement | Priority | Notes |
| --- | --- | --- | --- |
| REQ-5.2.1 | Users can create, edit and delete income and expense transactions; the category type must match the transaction type. | Must Have | E5-F2-S1 |
| REQ-5.2.2 | Edits and deletes update wallet balances consistently; users cannot touch other users' data; validations and ownership are tested. | Must Have | E5-F2-S1 |
| REQ-5.2.3 | Transactions can be filtered by date range, wallet, category, type, text and amount range. The amount range filter applies to a single currency only (it requires a wallet or currency selection) because amounts in different currencies are not comparable. | Must Have | E5-F2-S2 |
| REQ-5.2.4 | Pagination and sort are stable and bounded; queries use indexes (verified with explain). | Must Have | E5-F2-S2 |
| REQ-5.2.5 | The transaction form supports income, expense and transfer modes, shows validation and server errors inline, and requires confirmation to delete. | Must Have | E5-F2-S3 |
| REQ-5.2.6 | The transaction list keeps filters and search in URL state, paginates with loading and empty states, and is responsive on mobile. | Must Have | E5-F2-S4 |
| REQ-5.2.7 | The transaction composer is an overlay driven by URL state: `?compose=` opens it for a new transaction (by mode) and `?tx=` opens it to edit an existing one, so it is linkable and survives reload and back navigation. | Must Have | E5-F2-S3; Sprint 2 decision |

#### Feature 5.3: CSV Export

| ID | Requirement | Priority | Notes |
| --- | --- | --- | --- |
| REQ-5.3.1 | Export honours the same filters as the list. | Should Have | E5-F3-S1 |
| REQ-5.3.2 | Exported cells are protected against formula injection. | Should Have | E5-F3-S1 |
| REQ-5.3.3 | Large exports stream without loading all rows in memory. | Should Have | E5-F3-S1 |
| REQ-5.3.4 | The export button downloads the current filtered result, shows progress and error states, and is an accessible labelled control. | Should Have | E5-F3-S2 |

### Epic 6: Budgets

#### Feature 6.1: Budget Management

| ID | Requirement | Priority | Notes |
| --- | --- | --- | --- |
| REQ-6.1.1 | Budgets support overall and per-category scope, a monthly default period with start date, and uniqueness per scope and period. | Should Have | E6-F1-S1 |
| REQ-6.1.2 | Designs show under/near/over progress states without relying on color alone, and a budget form. | Should Have | E6-F1-S2 |
| REQ-6.1.3 | Users can create budgets and see spent versus limit, computed from expense transactions in the period. | Should Have | E6-F1-S3 |
| REQ-6.1.4 | Archived and deleted data are handled correctly in progress; ownership is enforced and tested. | Should Have | E6-F1-S3 |
| REQ-6.1.5 | Warning states use a configurable threshold (default 80%) and a 100% state, are returned in API responses, and boundaries are unit tested. | Should Have | E6-F1-S4 |
| REQ-6.1.6 | The budgets UI supports create/edit/delete, shows spent, remaining and percent, and offers period navigation. | Should Have | E6-F1-S5 |
| REQ-6.1.7 | Warning badges for near and over states appear in budgets and the dashboard, carry text and icon with color, and are announced to screen readers. | Should Have | E6-F1-S6 |

### Epic 7: Dashboard and Reports

#### Feature 7.1: Reporting APIs

| ID | Requirement | Priority | Notes |
| --- | --- | --- | --- |
| REQ-7.1.1 | The dashboard summary returns balances per wallet and totals by currency, recent transactions and budget status, for a date range. | Should Have | E7-F1-S1 |
| REQ-7.1.2 | An income-versus-expense trend groups by day, week or month, returns empty periods as zeros, and is performance verified on a large data set. | Should Have | E7-F1-S2 |
| REQ-7.1.3 | A category breakdown returns totals and percentages, excludes transfers, and groups the tail as "other" (top-N). | Should Have | E7-F1-S3 |

#### Feature 7.2: Dashboard UI

| ID | Requirement | Priority | Notes |
| --- | --- | --- | --- |
| REQ-7.2.1 | Designs lay out cards, charts and recent list for desktop and mobile, with chart accessibility alternatives and a date-range control. | Should Have | E7-F2-S1 |
| REQ-7.2.2 | The dashboard shows balance, income and expense cards, recent transactions and budget status, with loading and empty states. | Should Have | E7-F2-S2 |
| REQ-7.2.3 | Trend and category charts render from the API, have text or table alternatives, and are responsive and theme aware. | Should Have | E7-F2-S3 |
| REQ-7.2.4 | A date-range selector offers presets and a custom range, applies to all dashboard widgets, and stores the range in the URL. | Should Have | E7-F2-S4 |

### Epic 8: Recurring Transactions

#### Feature 8.1: Recurring Templates

| ID | Requirement | Priority | Notes |
| --- | --- | --- | --- |
| REQ-8.1.1 | Template storage holds frequency, next run, end date and active flag; run history prevents duplicate generation; indexes support due-date queries. | Should Have | E8-F1-S1 |
| REQ-8.1.2 | Designs cover a frequency picker with next-date preview, a list with pause/resume, and mobile layout. | Should Have | E8-F1-S2 |
| REQ-8.1.3 | Users can create, edit, pause, resume and delete templates with daily, weekly, monthly and yearly frequencies. | Should Have | E8-F1-S3 |
| REQ-8.1.4 | Template dates and ownership are validated. | Should Have | E8-F1-S3 |
| REQ-8.1.5 | The scheduled job generates due transactions idempotently and is safe to run concurrently. | Should Have | E8-F1-S4 |
| REQ-8.1.6 | Missed runs are caught up per the documented policy; failures are logged and retried; tests simulate time passing. | Should Have | E8-F1-S4 |
| REQ-8.1.7 | The recurring UI lists, creates, edits, pauses and deletes templates, previews the next run, and shows validation errors. | Should Have | E8-F1-S5 |

### Epic 9: Admin

#### Feature 9.1: Audit Logging

| ID | Requirement | Priority | Notes |
| --- | --- | --- | --- |
| REQ-9.1.1 | An append-only audit table stores actor, action, target, timestamp and metadata, has no update or delete path, and has filter indexes. | Should Have | E9-F1-S1 |
| REQ-9.1.2 | Auth, role and admin events are logged; the log never stores passwords, tokens or transaction details. | Should Have | E9-F1-S2 |
| REQ-9.1.3 | Admins can query the audit log through a paginated, filterable, admin-only endpoint. | Should Have | E9-F1-S2 |

#### Feature 9.2: User and Role Management

| ID | Requirement | Priority | Notes |
| --- | --- | --- | --- |
| REQ-9.2.1 | Designs cover users, categories, metrics and audit screens, destructive-action confirmations and accessible data tables. | Should Have | E9-F2-S1 |
| REQ-9.2.2 | Admins can list, search, suspend, reactivate and change roles of users; admin-only authorization is enforced and tested. | Should Have | E9-F2-S2 |
| REQ-9.2.3 | The last admin and the acting admin cannot be demoted or suspended; suspension revokes sessions; actions are audit-logged. | Should Have | E9-F2-S2 |
| REQ-9.2.4 | No admin endpoint exposes user transactions. | Should Have | E9-F2-S2 |
| REQ-9.2.5 | The users screen offers a searchable, paginated table, confirmed suspend/reactivate/role changes, and hides admin routes from non-admins. | Should Have | E9-F2-S3 |

#### Feature 9.3: System Oversight

| ID | Requirement | Priority | Notes |
| --- | --- | --- | --- |
| REQ-9.3.1 | Admins can create, edit and retire system categories; retired categories remain on existing transactions; changes are audit-logged. | Should Have | E9-F3-S1 |
| REQ-9.3.2 | Platform metrics return counts of users, active users, wallets and transactions as aggregates only, cached sensibly. | Should Have | E9-F3-S2 |
| REQ-9.3.3 | The admin UI provides category management and a metrics dashboard with accessible visuals and error handling. | Should Have | E9-F3-S3 |
| REQ-9.3.4 | The audit log UI filters by actor, action and date, paginates, and shows loading, empty and error states. | Should Have | E9-F3-S4 |

### Epic 10: Hardening and Release

#### Feature 10.1: Security

| ID | Requirement | Priority | Notes |
| --- | --- | --- | --- |
| REQ-10.1.1 | Rate limits apply to login, register and reset endpoints, return 429 with retry hints, and are configurable and tested. | Must Have | E10-F1-S1. Status: Done, QA Pass. Per-IP refresh limiter added after review |
| REQ-10.1.2 | CSP and security headers are set, CORS is restricted by config, and input validation is reviewed on every endpoint. | Must Have | E10-F1-S2. Status: Done, QA Pass. Verified against the production build served by the API |
| REQ-10.1.3 | A backend review checks authorization on every endpoint, logs findings and documents a summary; none critical or high remain open. | Must Have | E10-F1-S3. Status: In Progress. Outcome recorded in [the backend review](./reviews/sprint-4-backend-security-review.md): no Critical or High findings |
| REQ-10.1.4 | A frontend review confirms no unsafe HTML injection, reviews token storage and tracks findings to closure. | Must Have | E10-F1-S4. Status: In Progress. Outcome recorded in [the frontend review](./reviews/sprint-4-frontend-review.md): findings fixed, accepted or tracked |
| REQ-10.1.5 | Guards found necessary in review hold: the readiness probe is cached so `/health` cannot be used to hammer the database, a forged pagination cursor is rejected with `INVALID_CURSOR`, and the server refuses to start in production with rate limiting disabled. | Must Have | E10-F1-S3 review findings M2, L1, L2 |

#### Feature 10.2: Quality Assurance

| ID | Requirement | Priority | Notes |
| --- | --- | --- | --- |
| REQ-10.2.1 | Coverage thresholds are met and enforced in CI; every acceptance criterion maps to a test; money and permission logic is tested. | Must Have | E10-F2-S1. Status: Done, QA Pass. Thresholds enforced by `pnpm test:coverage` in CI |
| REQ-10.2.2 | E2E tests cover register, wallet, transaction, budget, dashboard, recurring and admin journeys, run in CI against Docker, with flakiness controlled. | Must Have | E10-F2-S2. Status: Done, QA Pass. 75 Playwright tests pass against the production image (CI mode) |
| REQ-10.2.3 | Automated and manual keyboard and screen-reader checks verify WCAG 2.1 AA in both themes; issues are fixed or tracked. | Must Have | E10-F2-S3. Status: In Progress. axe, keyboard and contrast checks done; manual screen-reader checks NOT performed ([audit](./qa/accessibility-audit.md)) |
| REQ-10.2.4 | Performance sanity tests use a seeded large dataset for list and reports, document thresholds and report regressions. | Must Have | E10-F2-S4. Status: Done, QA Pass. [Baseline](./qa/performance-baseline.md) at 100,000 transactions |

#### Feature 10.3: Observability, Deployment and Release

| ID | Requirement | Priority | Notes |
| --- | --- | --- | --- |
| REQ-10.3.1 | Request logs carry correlation IDs, a protected metrics endpoint exists, and a runbook covers common failures. | Must Have | E10-F3-S1. Status: Done, QA Pass |
| REQ-10.3.2 | A production image builds in CI; a deployment guide covers env vars, migrations, rollback and backup. | Must Have | E10-F3-S2. Status: Done, QA Pass. Registry publishing is not set up ([deployment guide](./operations/deployment.md)) |
| REQ-10.3.3 | The OpenAPI document is published and matches the implementation; the user guide covers all features; docs are reviewed for standalone-product tone. | Must Have | E10-F3-S3. Status: In Progress. [API reference](./api/README.md) and [user guide](./user-guide.md) written; the OpenAPI file is committed and checked against the routes by tests |
| REQ-10.3.6 | Every route the server registers is described in the OpenAPI document, each operation states whether it is implemented or planned, and a test fails when the document and the routes disagree. | Must Have | E10-F3-S3; `apps/api/src/openapi.test.ts` |
| REQ-10.3.4 | The README provides overview, features, screenshots, quickstart, architecture and testing summary, and links to docs and license. | Must Have | E10-F3-S4. Status: In Progress. Screenshots are a marked TODO |
| REQ-10.3.5 | A release checklist confirms all stories are Done or documented as deferred, the summary table is final, and a Final Backlog Review section exists. | Must Have | E10-F3-S5. Status: In Progress. v1.0 is not declared ready |

**Requirement count:** 109 functional requirements across 10 epics and 24 features, covering all 80 stories.

---

## 5. Non-Functional Requirements

| ID | Category | Requirement | Priority | Verification |
| --- | --- | --- | --- | --- |
| NFR-P-1 | Performance | Wallet list with balances p95 under 50 ms; transaction list p95 under 200 ms; dashboard aggregations p95 under 300 ms, at 100k transactions for one user. | Must Have | `pnpm --filter @midas/api test:perf` and EXPLAIN checks (E10-F2-S4). Result 2026-10-19: met, see the NFR status section below. Concurrent load (autocannon) was not run |
| NFR-P-2 | Performance | Per-request auth check p95 under 5 ms; admin user search and audit query p95 under 200 ms at 50k users / 5M audit rows; uncached platform metrics under 2 s. | Should Have | Performance suite, query plans |
| NFR-P-3 | Performance | Initial SPA load LCP under 2.5 s on mid-range mobile; routes code-split; charts and password-strength checker lazy-loaded. | Should Have | Lighthouse or manual check. NOT verified: whether the large `password-*.js` chunk (about 1.66 MB minified) and the chart chunk load only when needed was not checked, and no bundle-size budget exists |
| NFR-P-4 | Performance | CSV export streams in constant server memory. | Should Have | Integration test with large dataset |
| NFR-S-1 | Security | Passwords hashed with argon2id; policy of 12 to 128 characters and a strength score of at least 3. | Must Have | Unit and integration tests |
| NFR-S-2 | Security | Access token held in memory only; refresh token (`<sid>.<random>`) is an httpOnly, Secure, SameSite=Strict cookie with rotation and reuse detection (implemented in Sprint 2); role checked from the database on every request. | Must Have | Integration tests, frontend review (E10-F1-S4) |
| NFR-S-3 | Security | Strict tenant isolation: every user-data query is scoped by user; another user's resource returns 404. | Must Have | Route-enumeration and ownership tests |
| NFR-S-4 | Security | Rate limits on auth, export and write endpoints; CSP, HSTS and security headers; CORS disabled in production. | Must Have | Integration tests (E10-F1-S1, E10-F1-S2) |
| NFR-S-5 | Security | No secrets in the repository; secret scanning and dependency audit on every PR; CodeQL on schedule and PRs. | Must Have | CI workflows. Secret scanning (gitleaks) and `pnpm audit` run in CI (one dev-only advisory is ignored with a written reason); CodeQL and osv-scanner are planned and NOT yet in place |
| NFR-S-6 | Security | Admin privacy boundary: no admin endpoint exposes users' financial records; the audit log stores no secrets or amounts. | Must Have | Route-enumeration tests, audit content tests |
| NFR-S-7 | Security | CSV export neutralizes formula-injection prefixes. | Must Have | Unit tests |
| NFR-S-8 | Security | The SPA runs under a strict CSP without `unsafe-inline`, verified against the production build served by the API: `e2e/tests/csp.spec.ts` records zero CSP violations across auth pages, dashboard, charts, dialogs, menus and toasts (28 Playwright tests passed locally with 0 CSP violations at review time; 75 passed against the production image in CI mode at the QA gate). | Must Have | `csp.spec.ts` (E10-F1-S2, E10-F1-S4). The first run of the CI `production-image` job on GitHub has NOT yet been observed |
| NFR-A-1 | Accessibility | WCAG 2.1 AA across all screens in light and dark themes, including contrast and keyboard operation. | Must Have | axe scans plus manual keyboard and screen-reader checklist (E10-F2-S3). Done: axe (0 violations on 17 routes in light and dark, plus an open dialog and menu), contrast checks, 7 keyboard checks. NOT done: screen-reader testing (NVDA, VoiceOver), zoom and reflow, forced colors. Open defects: A11Y-02 (focus lost after a confirmation from the wallet row menu), A11Y-03 (best-practice `region` rule) |
| NFR-A-2 | Accessibility | State is never conveyed by color alone (budget status, balances); charts have text or table alternatives; status changes are announced to assistive technology. | Must Have | Design review, component tests, manual checks |
| NFR-SC-1 | Scalability | Supports about 50k registered users, a few hundred concurrent, about 10k transactions per active user per year on a single instance. | Should Have | Performance suite |
| NFR-SC-2 | Scalability | Scheduler runs in the web process or a separate worker; concurrent runners are safe. Scaling past one instance requires a shared rate-limit store. | Should Have | Concurrency integration test; deployment guide |
| NFR-R-1 | Reliability | Graceful shutdown drains requests and stops the scheduler; the health endpoint reports liveness and database readiness. | Must Have | Integration tests, runbook |
| NFR-R-2 | Reliability | Generated recurring transactions are never duplicated or lost; failures retry and the template pauses after 5 consecutive failures. | Must Have | Time-travel and concurrency tests |
| NFR-R-3 | Reliability | Migrations are reversible and backward compatible for one release; backups with point-in-time recovery are documented. | Must Have | `migrate:verify` in CI, deployment guide |
| NFR-D-1 | Data Integrity | Money stored as integer minor units, no floating point; transfers, balance effects and category reassignment are atomic. | Must Have | Shared unit tests, invariant checks in integration tests |
| NFR-D-2 | Data Integrity | Audit rows are append-only for the application role. | Must Have | Database tests |
| NFR-D-3 | Data Integrity | Wallet ledger consistency is enforced by database triggers in addition to application code. | Must Have | PostgreSQL 17 integration tests, including concurrent transfers |
| NFR-M-1 | Maintainability | Coverage gates: shared 95%, core API modules 85%, API overall 80%, web 80%; every acceptance criterion maps to a test. | Must Have | CI coverage gate (E10-F2-S1) |
| NFR-M-2 | Maintainability | The API contract is the single authority; the committed OpenAPI document is checked for drift against the registered routes and the shared schemas. | Must Have | `openapi.test.ts` and `openapi-shapes.test.ts` (the OpenAPI file is maintained by hand, not generated; see section 6) |
| NFR-O-1 | Observability | Structured JSON logs with request IDs and sensitive fields redacted; Prometheus metrics behind a token. | Should Have | Integration tests, runbook |
| NFR-U-1 | Usability | Responsive layouts from mobile to desktop; light and dark themes; English-only UI copy in v1 with locale-aware number and date formatting. | Must Have | Design review, E2E |

### NFR status (2026-10-19)

**Security**

| Item | Status | Evidence |
| --- | --- | --- |
| Authorization on every endpoint | Verified: 62 routes enumerated; no Critical or High finding | [Backend security review](./reviews/sprint-4-backend-security-review.md), `route-auth-table.int.test.ts` |
| NFR-S-8 strict CSP on the production build | Verified against the production build served by the API (`apps/api/src/platform/web.ts`) | `e2e/tests/csp.spec.ts`; [frontend review](./reviews/sprint-4-frontend-review.md) |
| Dependency audit | `pnpm audit --prod` clean; one dev-only High advisory (GHSA-vfj7-8cjw-p6xm, through `kysely-codegen`) is ignored in `pnpm-workspace.yaml` with a written reason | CI job "Dependency audit" |
| CodeQL, osv-scanner | Not in place | Planned in [architecture](./architecture.md) |
| First GitHub run of the `production-image` and coverage CI jobs | Not yet observed | Backlog QA notes |

**Performance** (100,000 transactions for one user, PostgreSQL 17, sequential calls with the API in-process; [baseline](./qa/performance-baseline.md))

| Scenario | p95 | Target p95 |
| --- | --- | --- |
| Transaction lists (12 variants) | 14 to 24 ms | 200 ms |
| Wallets with balances | 9.4 ms | 50 ms |
| Reports and budgets | 69 ms or less (worst case: trend by month, 68.9 ms) | 300 ms |
| Dashboard (6 calls at once) | 25 ms | 300 ms |
| CSV export of all 100,000 rows | 4.7 s total; 9.9 MiB streamed | constant server memory |

Not measured: concurrent load, 50,000 users and 5,000,000 audit rows (admin search and audit queries), network, TLS and proxy, browser bundle size and render time.

**Accessibility** ([audit](./qa/accessibility-audit.md))

| Item | Status |
| --- | --- |
| axe-core (WCAG 2.0/2.1 A and AA), 17 routes in light and dark | 0 violations (34 scans), plus an open dialog and an open menu in both themes |
| Token contrast, both themes | 94 of 94 checks pass |
| Keyboard checks | 7 of 7 pass (A11Y-02 fixed) |
| Screen-reader testing (NVDA, VoiceOver) | **NOT performed** |
| Zoom, reflow, text spacing, forced colors, reduced motion, touch targets, axe at mobile width | Not checked |

---

## 6. Tech Stack and Architecture

| Layer | Technology | Decision rationale |
| --- | --- | --- |
| Architecture style | Modular monolith, single deployable | Simple operations and local ACID transactions (ADR-001) |
| Backend | TypeScript on Node.js 24 LTS, Fastify 5, Zod 4 | One language across the stack, schema-driven validation and OpenAPI (ADR-002) |
| Frontend | React 19, Vite, TanStack Router and Query, React Hook Form, Tailwind v4, Radix UI, Recharts | Typed URL state for filter-heavy screens, accessible primitives (ADR-003) |
| Rendering | Client-side SPA served from the API origin | App is private, so no SEO need; no CORS in production (ADR-004). The production image serves the compiled SPA from the API origin; local development uses the Vite dev server |
| Package management | pnpm workspaces, Node runtime | Strict dependency isolation for a multi-package repo (ADR-005) |
| API | Versioned REST, RFC 9457 errors, OpenAPI 3.1 description in `apps/api/openapi/openapi.yaml` | Stable, documented contract (ADR-006). The OpenAPI file is committed and maintained by hand; tests keep it in sync with the registered routes and the shared schemas. ADR-006 describes generation from the shared schemas, which is not implemented (TODO: architect to confirm or amend) |
| Auth | Argon2id passwords; 10-minute in-memory access JWT; rotating httpOnly refresh cookie | Limits XSS exposure, immediate suspension effect (ADR-007) |
| Database | PostgreSQL 17, Kysely on `pg`, node-pg-migrate | Constraints, triggers and locking carry money correctness; real up/down migrations (ADR-016, resolved in [database.md](./database.md)) |
| Money and time | Integer minor units; date-only ledger with per-user timezone | Exact arithmetic, no day-boundary bugs (ADR-009, ADR-017) |
| Scheduling | In-process scheduler coordinated through the database | No extra infrastructure; idempotent by unique run key (ADR-011) |
| Email | Mailer port with SMTP, console and memory adapters; Mailpit locally | Provider-agnostic (ADR-010) |
| Deployment | One production Docker image (target `runtime`): compiled API plus the built SPA, production dependencies only, no `tsx` or dev tooling, runs as the unprivileged `node` user, health check on `/health`; managed PostgreSQL; GitHub Actions CI builds and smoke-tests the image | Portable and inexpensive (ADR-014). Publishing to a registry is not set up; see the [deployment guide](./operations/deployment.md) |
| Testing | Vitest, Testcontainers, MSW, React Testing Library, Playwright with axe, autocannon | Real database in integration tests (ADR-015) |

**Architecture summary.** One Fastify process hosts all domain modules (auth, users, wallets, categories, transactions, transfers, budgets, reports, recurring, admin, audit) and serves the compiled SPA in the production image (single process, single origin, no CORS). A shared package holds the Zod schemas, money helpers, and recurrence and budget math used by both API and web. PostgreSQL is the only datastore. Full detail: [architecture.md](./architecture.md) and [database.md](./database.md).

---

## 7. Constraints and Assumptions

**Constraints**

- Sprints 1 to 3 are implemented and Sprint 4 (hardening and release) is in progress. v1.0 is not declared ready: open gates are manual screen-reader testing, QA sign-off of the review and documentation stories, and the first observed CI run of the production-image job.
- Rate-limit counters are held per instance; running more than one instance needs a shared store (NFR-SC-2).
- Behind a reverse proxy, `TRUST_PROXY` must be set to the number of proxies, otherwise every user shares one client address for rate limiting.
- The strict CSP forbids inline scripts and styles, so UI components must not rely on libraries that inject them (native select and radio controls are used).
- Public repository; no secrets, personal data or internal references in any committed file.
- Documentation reads as a standalone product.
- Pragmatic deployable stack: Docker for local development, a one-click-style deployment story, and CI with lint, test and build.
- `docs/api-contract.md` is read-only for implementers; discrepancies are raised to the architect.
- Definition of Done is verified by qa-agent only (see the tracker).
- No git worktrees.

**Assumptions**

- Scale of about 50k users and 10k transactions per active user per year holds for v1.
- Single currency per wallet; no foreign exchange rates; totals are shown per currency.
- No email verification at registration in v1 (additive later).
- A single application instance in v1; in-memory rate limits are acceptable until scaling out.
- The default branch is `master` (confirmed; architecture risk R14 is resolved).
- TODO: audit log retention of 400 days is proposed and still to be confirmed (architecture section 8.5).
- TODO: the contract has no error code for a wallet balance outside the allowed range (database.md open item 1; architect to resolve).
- UI copy is English-only; locale affects formatting only.
- Session ids are treated as semi-sensitive: a forged refresh token that names a live session ends that session (accepted ADR-007 reuse-detection trade-off, review finding L5).
- Registration reveals whether an email is already registered through `409 EMAIL_TAKEN` (accepted trade-off, limited to 5 registrations per hour per IP, review finding L4).

---

## 8. Out of Scope

- Bank-account syncing.
- Shared wallets between multiple users.
- Receipt OCR.
- Native mobile applications.
- Payments or subscriptions.
- Automatic currency conversion and consolidated cross-currency net worth.
- Email verification at registration.
- Account self-deletion.
- Recurring transfers.
- Custom budget period start days and budget limit history.
- Idempotency keys and optimistic concurrency (ETag) on writes.
- Admin "view as user" or any per-user financial statistics.
- UI localization of copy.

**Planned but not built (status, not exclusions; TODO: owner decision before v1.0 or explicit deferral)**

- Publishing the image to a container registry and a tag-driven release workflow.
- CodeQL and osv-scanner in CI.
- Serving the OpenAPI document from the running API and generating it from the shared schemas.
- Concurrent-load, 50,000-user and 5,000,000-audit-row performance tests.
- Manual screen-reader testing (NVDA, VoiceOver).

---

## 9. Glossary

| Term | Definition |
| --- | --- |
| Admin | A user with role `admin`; can manage users and system categories and view platform metrics and the audit log. |
| ADR | Architecture decision record; a documented decision with context, alternatives and consequences. |
| Audit log | Append-only record of auth events and admin actions, with IDs and metadata but no financial details or secrets. |
| Budget | A spending limit for a period, either overall or for one expense category, in one currency. |
| Budget state | `ok`, `warning` (at or above threshold) or `exceeded` (spent at or above limit). |
| Catch-up | Generation of missed recurring occurrences up to today, capped per scheduler tick. |
| Category | A label classifying a transaction as income or expense; system (admin-managed) or user-owned. |
| Cursor (keyset) pagination | Pagination using an opaque position token instead of page numbers. |
| Minor units | Smallest currency unit as an integer (for example cents); the basis for all stored amounts. |
| OpenAPI | The machine-readable API description in `apps/api/openapi/openapi.yaml`. |
| Production image | The single Docker image that contains the compiled API and the built web app. |
| Problem Details | RFC 9457 error response format with stable machine codes. |
| Recurring template | A schedule that automatically generates income or expense transactions. |
| Refresh token | Long-lived rotating credential in an httpOnly cookie, used to obtain new access tokens. Format `<sid>.<random>`. |
| Reuse detection | Revoking a session when an already-rotated refresh token is presented again, indicating possible theft. |
| CSP | Content Security Policy: the response header that restricts what the browser may load and run. Midas forbids inline scripts and styles. |
| Composer | The transaction create/edit overlay, opened through the `?compose=` or `?tx=` URL parameters. |
| toAmountMinor | The explicit destination amount, in minor units, required for cross-currency transfers (ADR-008). |
| Retired category | A system category no longer selectable for new data but still shown on existing transactions. |
| Session | A signed-in browser instance, revocable by logout, suspension or password reset. |
| System category | A default category managed by admins and read-only to users. |
| Transfer | Movement between two of a user's wallets, stored as two linked transactions. |
| Wallet | A place where money is held (cash, bank, card, savings), with one currency and an opening balance. |
| WCAG 2.1 AA | Web Content Accessibility Guidelines conformance level targeted by the product. |

---

## 10. Revision History

| Version | Date | Agent/Author | Changes |
| --- | --- | --- | --- |
| 1.0 | 2026-10-16 | docs-agent | Initial specification derived from the project brief, architecture, API contract, database design, UI design and dev stories tracker. |
| 1.1 | 2026-10-18 | docs-agent | Sprint 2 update. Added implementation status and deferral notes to section 4. Added REQ-2.2.8 to 2.2.10, REQ-5.1.3, REQ-5.2.7; clarified REQ-2.2.4, 3.2.3, 5.2.3. Added NFR-S-8 and NFR-D-3; updated NFR-S-2. Recorded Sprint 2 decisions (ADR-008 explicit toAmountMinor, `<sid>.<random>` refresh token, native controls under strict CSP, single-currency amount filter, URL-driven composer). Deferred SPA-from-API and CSP e2e to Sprint 4. Updated constraints, rendering note and glossary. |
| 1.2 | 2026-10-19 | docs-agent | Sprint 3 update. Implementation status now covers CSV export, budgets, dashboard and reports, recurring transactions and admin; known gaps listed. |
| 1.3 | 2026-10-19 | docs-agent | Sprint 4 update. Epic 10 status recorded per requirement; added REQ-10.1.5 and REQ-10.3.6 (requirement count corrected to 109). NFR-S-8 verified against the production build served by the API; added an NFR status section (security, performance baseline at 100k transactions, accessibility with screen-reader testing recorded as NOT performed). Tech stack: single production image (compiled, non-root, production dependencies only) serving API and SPA; OpenAPI recorded as committed and test-checked rather than generated. Constraints, assumptions (accepted review trade-offs) and out-of-scope (planned but not built) updated; glossary extended. Linked the review records, API reference and user guide. |

# Backend code and security review (Sprint 4)

- **Story:** E10-F1-S3
- **Date:** 2026-10-19
- **Verdict:** Approved with comments. No Critical or High findings. Every finding below is Fixed or Accepted with a written rationale; none is open.
- **Scope:** the whole API (`apps/api`): authentication and session handling, authorization on every route, input validation, rate limiting, error handling and logging, the database access layer, configuration, dependencies and the production image.
- **Method:** all 62 registered routes were enumerated and checked for authentication, role and ownership rules; code was read module by module; the findings were checked against tests; `pnpm audit --prod` was run.

## Summary

| Severity | Findings | Fixed | Accepted | Open |
| --- | --- | --- | --- | --- |
| Critical | 0 | 0 | 0 | 0 |
| High | 0 | 0 | 0 | 0 |
| Medium | 3 (M1 to M3) | 3 | 0 | 0 |
| Low | 9 (L1 to L9) | 6 (L1, L2, L6, L7, L8, L9) | 3 (L3, L4, L5) | 0 |

Dependency audit: `pnpm audit --prod` reports no vulnerabilities. One High advisory exists in development tooling only, `braces` GHSA-vfj7-8cjw-p6xm, reached through `kysely-codegen` (a code generator that runs on a developer machine and in CI, never in the runtime image). It is ignored in `pnpm-workspace.yaml` under `auditConfig.ignoreGhsas` with the reason written next to it and a note to re-evaluate when the dependency chain drops `braces`. CI audits all dependencies at the `high` level (job "Dependency audit").

## Authorization by endpoint group

All 62 routes fall into three scopes. The table is derived from the route table, and `apps/api/test/api/route-auth-table.int.test.ts` enforces it on every run (see finding M3).

| Group | Routes | Authentication | Additional rule |
| --- | --- | --- | --- |
| Public: ops | `GET /health` | None | Cached readiness probe (finding M2) |
| Public: ops | `GET /metrics` | `Authorization: Bearer <METRICS_TOKEN>` | Answers 404 when `METRICS_TOKEN` is unset |
| Public: auth | 7 routes: `POST /api/v1/auth/register`, `login`, `refresh`, `logout`, `password/forgot`, `password/reset/verify`, `password/reset` | None (refresh and logout use the `midas_rt` cookie plus the `X-CSRF-Protection` header) | Per-route rate limits (see the [API reference](../api/README.md)) |
| Protected, user | 41 routes: profile (`/me`, 3), wallets (7), categories (4), transactions (6 including export), transfers (4), budgets (5), reports (3), recurring templates (9) | One protected scope with an `onRequest` guard: HS256 JWT checked for issuer, audience and expiry; the session and the user status are reloaded from the database on every request | Ownership is enforced in every repository query through `user_id`, backed by composite foreign keys. A resource owned by someone else answers `404 NOT_FOUND`, never 403 |
| Protected, admin | 12 routes under `/api/v1/admin` (users 5, default categories 5, metrics 1, audit log 1) | Same guard as the user scope | Role `admin` is read from the database on each request (not from the token). A non-admin receives 403 |

Admin endpoints never read or return the financial data of other users (wallets, transactions, budgets, recurring items); they see accounts, system categories, aggregate counts and the audit log only (ADR-018). `route-auth-table.int.test.ts` asserts 401 without credentials on every route outside the exact public allow-list and 403 for a non-admin on every admin route. Ownership is covered by the IDOR tests in `apps/api/test/api/security*.int.test.ts` and the per-resource suites.

## Findings

| ID | Severity | Finding | Status | Fix and test |
| --- | --- | --- | --- | --- |
| M1 | Medium | The refresh limiter could be bypassed by sending forged session ids, because each forged id got its own counter | Fixed | A per-IP refresh limiter (`RATE_LIMIT_REFRESH_IP_MAX`, default 60 per minute) sits beside the per-session one. `apps/api/src/platform/config.ts`; test in `apps/api/src/modules/auth/rate-limits.test.ts` |
| M2 | Medium | `GET /health` ran an unlimited database probe per call, so it could be used to load the database | Fixed | The probe result is cached for 2 seconds and concurrent calls share one in-flight probe (single-flight). `apps/api/src/modules/health/routes.ts`; test "shares one database probe between concurrent /health calls and caches it briefly" in `apps/api/src/app.test.ts` |
| M3 | Medium | The authorization route lists in tests were kept by hand and could drift from the real routes | Fixed | `apps/api/test/api/route-auth-table.int.test.ts` derives its expectations from the registered route table; `input-validation-audit.int.test.ts` walks the same table |
| L1 | Low | A crafted pagination cursor with year 0000 caused a 500 | Fixed | Cursor timestamps are bounded to the years 1900 to 2100 and anything else returns `400 INVALID_CURSOR`. `apps/api/src/platform/cursor-time.ts`; tests "rejects a cursor with a timestamp outside years 1900-2100" in `apps/api/test/api/transactions-list.int.test.ts` and `apps/api/test/api/audit-query.int.test.ts` |
| L2 | Low | `RATE_LIMIT_ENABLED=false` was accepted in production | Fixed | Configuration loading refuses to start. `apps/api/src/platform/config.ts`; test in `apps/api/src/platform/config.test.ts` |
| L3 | Low | Bodyless POST routes and detail GET routes ignore unknown input, whereas the contract is strict elsewhere | Accepted (documented exception) | Nothing from that input reaches the database. The routes are allow-listed in `apps/api/test/api/input-validation-audit.int.test.ts` (`BODYLESS_POSTS`), which still asserts they never return a 5xx under hostile input |
| L4 | Low | Registration reveals that an email is already registered (`409 EMAIL_TAKEN`) | Accepted (trade-off) | A clear error is required by the registration story (architecture risk R5). Mitigation: registration is limited to 5 per hour per IP |
| L5 | Low | A forged refresh token that names a live session ends that session | Accepted (trade-off) | This is the reuse-detection behaviour of ADR-007: a token that fails the check revokes the session it names. An attacker needs a session id they cannot normally see, so session ids are treated as semi-sensitive. Recorded in the specification constraints |
| L6 | Low | The audit actor of a failed login was recorded as the victim account | Fixed | A failed login is recorded with a null actor. `apps/api/src/modules/auth/service.ts`; audit assertions in `apps/api/test/api/audit-events.int.test.ts` |
| L7 | Low | A PostgreSQL error message could log user input for data-exception errors (SQLSTATE class 22) | Fixed | The message is dropped for those errors. `apps/api/src/platform/logging.ts`; test "omits the message of SQLSTATE class 22 errors" in `apps/api/src/platform/logging.test.ts` |
| L8 | Low | A password reset link stayed usable after the account was suspended | Fixed | The account status is re-checked when the token is used. `apps/api/src/modules/auth/password-service.ts`; test "rejects a token issued before the account was suspended, without leaking why" in `apps/api/test/api/password.int.test.ts` |
| L9 | Low | The runtime image carried development dependencies and `tsx` | Fixed | A dedicated production image (`infra/docker/Dockerfile`, target `runtime`) compiles the API and ships production dependencies only, with no `tsx`, no `.env` and no dev tooling, running as the unprivileged `node` user. CI checks the image contents (job "Production image"). See the [deployment guide](../operations/deployment.md). The production image measured 415 MB; the previous development image was not measured |

## Residual items

- Rate-limit counters are held per instance. Running several instances needs a shared store (specification NFR-SC-2; deployment guide).
- L3 is an accepted deviation from the strict-input rule. If the contract is ever tightened for bodyless routes, remove the allow-list entry and the audit will start asserting 400.

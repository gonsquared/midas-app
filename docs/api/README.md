# Midas API reference

This page is the entry point for the Midas HTTP API: how to authenticate, the rules every endpoint follows, and where the complete reference lives.

| You want | Go to |
| --- | --- |
| Every endpoint, request and response model, with the exact fields | [OpenAPI 3.1 description](../../apps/api/openapi/openapi.yaml) |
| The written specification (conventions, models, per-endpoint rules and error codes) | [API contract](../api-contract.md) |
| What the screens in the web app do | [User guide](../user-guide.md) |
| Troubleshooting a failing API | [API troubleshooting runbook](../operations/troubleshoot-api.md) |

The OpenAPI file lists 62 operations, every one marked `x-implementation-status: implemented`. The API contract is the design authority; if the two ever differ, report it as a defect.

## Getting the OpenAPI document

The document is a committed file, `apps/api/openapi/openapi.yaml` (OpenAPI 3.1, YAML). It is maintained alongside the code and is not generated at build time, and the running server does not serve it. Open it directly in the repository, or load that file into any OpenAPI viewer (for example Swagger UI, Redoc or Postman).

Two tests keep it honest and run with the API test suite:

- `apps/api/src/openapi.test.ts` validates the file as OpenAPI 3.1, requires every operation to be marked `implemented` or `planned`, and fails if a route registered by the server is missing from the file, or if an operation is marked implemented without a route (and the reverse).
- `apps/api/src/openapi-shapes.test.ts` checks that the payload schemas for budgets, recurring templates, reports, admin users, the audit log and platform metrics carry the same fields as the shared Zod schemas used by the server and the web app.

Run just these two with `pnpm --filter @midas/api exec vitest run src/openapi.test.ts src/openapi-shapes.test.ts` (verified on 2026-10-19: 2 files, 19 tests passed, no database needed). The shapes test covers the later endpoints only; the earlier ones are checked by the route-level tests in the API suite.

## Base URL and format

- API base path: `/api/v1`. The operational endpoints `GET /health` and `GET /metrics` are at the root.
- The API and the web app share one origin, so no CORS configuration is needed in production.
- Request and response bodies are JSON with camelCase fields (`application/json`). Exceptions: the CSV export (`text/csv`) and errors (`application/problem+json`).
- Request schemas are strict: an unknown field is rejected with `400 VALIDATION_FAILED`.
- `PATCH` is partial: omitted fields are unchanged and `null` clears a field that allows it.
- Query arrays use repeated keys, for example `?walletId=a&walletId=b`.
- Dates are `YYYY-MM-DD` calendar dates; timestamps are ISO 8601 in UTC.
- Money is always an integer number of minor units (for example cents) paired with an ISO 4217 currency code. Floating-point amounts are never used.
- Every response carries an `X-Request-Id` header. You may send your own (8 to 64 letters, digits or hyphens); otherwise the server generates one. Quote it when reporting a problem.

## Authentication model

1. **Register or sign in** with `POST /api/v1/auth/register` or `POST /api/v1/auth/login`. The response body contains the user, their preferences and a short-lived **access token** (a signed JWT, 10 minutes by default).
2. **Call protected endpoints** with `Authorization: Bearer <accessToken>`. The server re-checks the session and the account status on every request, so suspending an account or ending a session takes effect immediately.
3. **Renew** with `POST /api/v1/auth/refresh`. The long-lived **refresh credential** is an `httpOnly`, `Secure`, `SameSite=Strict` cookie named `midas_rt` (path `/api/v1/auth`, 30 days by default). It rotates on every use, and presenting an old one ends the session. Refresh and logout also require an `Origin` header matching the app origin and the header `X-CSRF-Protection: 1`.
4. **Sign out** with `POST /api/v1/auth/logout` (returns 204, idempotent).
5. **Reset a forgotten password** with `POST /api/v1/auth/password/forgot` (always returns 202, whether or not the email exists), then `POST /api/v1/auth/password/reset/verify` and `POST /api/v1/auth/password/reset`. A reset ends every session of the account.

Access scopes:

| Scope | Requirement |
| --- | --- |
| Public | No credentials: `/health`, the seven `/api/v1/auth/*` routes |
| Metrics | `Authorization: Bearer <METRICS_TOKEN>`; `GET /metrics` answers 404 when no token is configured |
| User | A valid access token for an active account |
| Admin | As User, and the account role is `admin` (read from the database on each request); everything under `/api/v1/admin` |

A resource that belongs to another user is reported as `404 NOT_FOUND`, never `403`. Admin endpoints never expose the financial records of other users. See the [backend security review](../reviews/sprint-4-backend-security-review.md) for the per-group authorization table.

Browser clients keep the access token in memory only. Server-side or script clients can use the access token the same way and must handle the refresh cookie like any other cookie jar.

## Errors

Errors use RFC 9457 Problem Details (`application/problem+json`):

| Field | Meaning |
| --- | --- |
| `type`, `title`, `status`, `detail` | Standard Problem Details members |
| `instance` | The request path |
| `code` | A stable machine-readable code (see below). Branch on this, not on `title` or `detail` |
| `requestId` | The request id, for support and log correlation |
| `errors` | For validation and field-specific errors: a list of `field` (dot path), `code` and `message` |

| Status | Meaning |
| --- | --- |
| 400 | Validation failure (`VALIDATION_FAILED`), malformed JSON, invalid cursor (`INVALID_CURSOR`), range too large (`RANGE_TOO_LARGE`), invalid or used reset token (`RESET_TOKEN_INVALID`), wrong current password (`INVALID_CURRENT_PASSWORD`) |
| 401 | Missing, invalid or expired access token (`UNAUTHENTICATED`); bad credentials (`INVALID_CREDENTIALS`); invalid session (`SESSION_INVALID`) |
| 403 | Not permitted: `FORBIDDEN` (for example a non-admin on an admin route), `ACCOUNT_SUSPENDED` at sign-in, `SYSTEM_CATEGORY_READ_ONLY` |
| 404 | `NOT_FOUND`: the resource does not exist or belongs to another user |
| 409 | State conflict: duplicate names, archived or in-use wallets and categories, existing budget, limit reached, last administrator and similar |
| 422 | A business rule failed: type mismatch, same-wallet transfer, missing or mismatched destination amount, invalid reference |
| 429 | `RATE_LIMITED` with a `Retry-After` header |
| 500 | `INTERNAL_ERROR` (no internals are returned) |
| 503 | `GET /health` only: a dependency is down |

The complete list of codes and the status for each is in the [API contract, section 1.5](../api-contract.md#15-errors). Every endpoint can return 400 `VALIDATION_FAILED`, 429 and 500, and every protected endpoint can return 401.

Registration and sign-in are deliberately specific or generic as follows: sign-in returns the same `INVALID_CREDENTIALS` for an unknown email and a wrong password; registration returns `409 EMAIL_TAKEN` when the email already exists; the forgot-password endpoint returns the same `202` either way.

## Pagination

Two styles are used.

**Cursor pagination** for high-volume lists (transactions, recurring runs and the audit log): send `limit` (1 to 100, default 25) and `cursor`. The response is `{ "items": [...], "nextCursor": "..." | null }`. Pass `nextCursor` back as `cursor` to get the next page; `null` means the end. A cursor is opaque and is bound to the sort order and filters it was issued for: change either and the old cursor is rejected with `400 INVALID_CURSOR`.

**Page numbers** for the administrator user table: send `page` (1 to 1000, default 1) and `pageSize` (1 to 100, default 25). The response contains `items`, `page`, `pageSize`, `totalItems` and `totalPages`. Deeper pages are rejected; narrow with filters instead.

Other lists (wallets, categories, budgets, recurring templates) return an `items` array with a fixed upper bound and no paging (for example at most 100 wallets, and at most 200 budgets or recurring templates). See the OpenAPI file for the exact response shape of each endpoint.

## Filtering, sorting and reports

- `GET /api/v1/transactions` accepts `from`, `to`, repeatable `walletId`, `categoryId` and `type`, `q` (a case-insensitive substring of the note, 1 to 100 characters), `minAmountMinor`, `maxAmountMinor` and `sort` (default newest first). Each leg of a transfer appears as its own row in its own wallet.
- `GET /api/v1/transactions/export` takes the same filters (without `limit` and `cursor`) and streams a UTF-8 CSV with a byte-order mark. Text cells that could be read as a formula by a spreadsheet are prefixed with an apostrophe. One export per user can run at a time, and a time cap applies.
- `GET /api/v1/reports/summary`, `/trend` and `/category-breakdown` aggregate per currency. A report range is limited (1,830 days) and a trend to 400 buckets, otherwise `400 RANGE_TOO_LARGE`.

## Rate limiting

Limits are applied per client address, per account or per session depending on the route, in fixed windows. When a limit is exceeded the API answers `429 RATE_LIMITED` with an integer `Retry-After` (seconds). Responses also carry `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset`. The 429 body never contains an IP address or email.

Defaults (the maximums are configurable with the `RATE_LIMIT_*` environment variables; see the [deployment guide](../operations/deployment.md)):

| Route or group | Default limit |
| --- | --- |
| Register | 5 per hour per IP |
| Sign in | 5 per minute per IP and email; 20 per minute per IP; 20 per hour per account |
| Forgot password | 3 per hour per email; 10 per hour per IP |
| Password reset (and verify) | 10 per hour per IP |
| Refresh | 30 per minute per session; 60 per minute per IP |
| Change password | 10 per hour per user |
| Authenticated writes | 120 per minute per user |
| Authenticated reads | 600 per minute per user |
| CSV export | 10 per minute per user |
| All API requests | 1,200 per minute per IP |

Behind a reverse proxy, set `TRUST_PROXY` to the number of proxies, otherwise all users appear to share one address. Counters are held in memory per server instance.

## Endpoint overview

| Area | Operations |
| --- | --- |
| Operations | `GET /health`, `GET /metrics` |
| Authentication | register, login, refresh, logout, password forgot, reset verify, reset |
| Profile | `GET /me`, `PATCH /me`, `POST /me/password` |
| Wallets | list, create, get, update, delete, archive, unarchive |
| Categories | list, create, update, delete (with optional reassignment) |
| Transactions | list, create, export, get, update, delete |
| Transfers | create, get, update, delete (cross-currency transfers take the destination amount explicitly) |
| Budgets | list, create, get, update, delete |
| Reports | summary, trend, category breakdown |
| Recurring templates | list, create, preview, get, update, delete, pause, resume, runs |
| Admin | users (list, detail, suspend, reactivate, change role); default categories (list, create, update, retire, restore); platform metrics; audit log |

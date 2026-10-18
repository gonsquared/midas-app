# Midas API Contract (v1)

**Status:** Approved baseline. **Read-only for implementation agents.**
**Owner:** software-architect-agent. Changes require an architect decision and an entry in the architecture decision log.
**Last updated:** 2026-10-16

Implementers who find a gap or conflict must report it as a risk and must not edit this file. The shared Zod schemas in `packages/shared` implement this contract, and the generated OpenAPI 3.1 document must match it.

---

## 1. Conventions

### 1.1 Base paths and format

- API base: `/api/v1`. Ops endpoints `/health` and `/metrics` are at the root.
- Request and response bodies are `application/json; charset=utf-8` with camelCase fields, except the CSV export (`text/csv`) and errors (`application/problem+json`).
- Request schemas are strict: unknown fields are rejected with `400 VALIDATION_FAILED`.
- `PATCH` is partial: omitted fields are unchanged, and `null` clears a nullable field.
- Query arrays use repeated keys, for example `?walletId=a&walletId=b`.

### 1.2 Auth requirement labels

| Label | Meaning |
| --- | --- |
| Public | No authentication |
| User | Valid `Authorization: Bearer <accessToken>`, user status `active`, role `user` or `admin` |
| Admin | As User, with current role `admin` (the role is read from the database on each request) |
| Refresh cookie | `midas_rt` cookie, `Origin` matching the app origin, and header `X-CSRF-Protection: 1` |
| Metrics token | `Authorization: Bearer <METRICS_TOKEN>` |

### 1.3 Scalar formats

| Name | Format |
| --- | --- |
| `Uuid` | UUID string |
| `LocalDate` | `YYYY-MM-DD` calendar date, valid range 1900-01-01 to 2100-12-31 |
| `Timestamp` | ISO 8601 UTC, for example `2026-10-16T08:30:00.000Z` |
| `CurrencyCode` | 3 uppercase letters from `SUPPORTED_CURRENCIES` (shared) |
| `Locale` | BCP 47 tag from `SUPPORTED_LOCALES` (shared), for example `en-US` |
| `TimeZone` | IANA zone name, for example `Europe/Berlin` |
| `AmountMinor` | Integer minor units, 1 to 100000000000000 (positive amounts) |
| `SignedAmountMinor` | Integer minor units, −100000000000000 to 100000000000000 |
| `IconKey` | String from `CATEGORY_ICONS` (shared) |
| `ColorToken` | String from `CATEGORY_COLORS` (shared palette keys with light and dark values) |

### 1.4 Pagination

**Cursor pagination:** query `limit` (integer 1–100, default 25) and `cursor` (opaque string from a previous response). A cursor is bound to its sort and filters; a mismatched or invalid cursor returns `400 INVALID_CURSOR`.

| Field | Type |
| --- | --- |
| items | T[] |
| nextCursor | string \| null |

**Offset pagination:** query `page` (integer 1–1000, default 1; deeper pages are rejected, narrow with filters) and `pageSize` (integer 1–100, default 25).

| Field | Type |
| --- | --- |
| items | T[] |
| page | integer |
| pageSize | integer |
| totalItems | integer |
| totalPages | integer |

### 1.5 Errors

All errors use RFC 9457 Problem Details (see the `Problem` model). Status code usage:

| Status | Use |
| --- | --- |
| 400 | Schema validation failure (`VALIDATION_FAILED`), malformed JSON, invalid cursor or range, invalid reset token |
| 401 | Missing, invalid or expired access token; invalid session; invalid credentials |
| 403 | Authenticated but not permitted (non-admin on admin route, suspended at login, system category read-only) |
| 404 | Resource does not exist **or is owned by another user** |
| 409 | State conflict (duplicate, in use, archived, limit reached, last admin) |
| 422 | Semantic business-rule violation (type mismatch, same-wallet transfer, invalid reference) |
| 429 | Rate limited (`Retry-After` header present) |
| 500 | Unexpected error (`INTERNAL_ERROR`, no internals leaked) |
| 503 | Dependency unavailable (health check) |

**Error code catalogue**

| Code | Status |
| --- | --- |
| VALIDATION_FAILED | 400 |
| INVALID_CURSOR | 400 |
| RANGE_TOO_LARGE | 400 |
| RESET_TOKEN_INVALID | 400 |
| INVALID_CURRENT_PASSWORD | 400 |
| UNAUTHENTICATED | 401 |
| INVALID_CREDENTIALS | 401 |
| SESSION_INVALID | 401 |
| ACCOUNT_SUSPENDED | 403 |
| FORBIDDEN | 403 |
| SYSTEM_CATEGORY_READ_ONLY | 403 |
| NOT_FOUND | 404 |
| EMAIL_TAKEN | 409 |
| WALLET_NAME_TAKEN | 409 |
| WALLET_ARCHIVED | 409 |
| WALLET_CURRENCY_LOCKED | 409 |
| WALLET_IN_USE | 409 |
| CATEGORY_NAME_TAKEN | 409 |
| CATEGORY_IN_USE | 409 |
| BUDGET_EXISTS | 409 |
| LIMIT_REACHED | 409 |
| TRANSFER_LEG_IMMUTABLE | 409 |
| TEMPLATE_ENDED | 409 |
| CANNOT_MODIFY_SELF | 409 |
| LAST_ADMIN | 409 |
| INVALID_REFERENCE | 422 |
| CATEGORY_TYPE_MISMATCH | 422 |
| CATEGORY_RETIRED | 422 |
| SAME_WALLET_TRANSFER | 422 |
| TO_AMOUNT_REQUIRED | 422 |
| TO_AMOUNT_MISMATCH | 422 |
| REASSIGN_TARGET_INVALID | 422 |
| RATE_LIMITED | 429 |
| INTERNAL_ERROR | 500 |

Every authenticated endpoint can also return `401 UNAUTHENTICATED`. Every endpoint can also return `400 VALIDATION_FAILED`, `429 RATE_LIMITED` and `500 INTERNAL_ERROR`. These are not repeated per endpoint below.

### 1.6 Headers

- `X-Request-Id`: optional on requests (accepted if it matches `^[A-Za-z0-9-]{8,64}$`; otherwise one is generated). Always echoed on responses and included as `requestId` in errors. It is for log correlation only: the `requestId` stored in audit rows is always generated by the server, never taken from the header.
- Rate-limit headers: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, and `Retry-After` on 429.
- `Set-Cookie: midas_rt=…; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth; Max-Age=2592000` is set by register, login and refresh, and cleared by logout and by a failed refresh.

---

## 2. Shared Models

### 2.1 Enums

| Enum | Values |
| --- | --- |
| Role | `user`, `admin` |
| UserStatus | `active`, `suspended` |
| Theme | `light`, `dark`, `system` |
| WalletType | `cash`, `bank`, `card`, `savings` |
| CategoryType | `income`, `expense` |
| TransactionType | `income`, `expense`, `transfer` |
| TransferDirection | `out`, `in` |
| TransactionSort | `date_desc` (default), `date_asc`, `amount_desc`, `amount_asc` |
| BudgetScope | `overall`, `category` |
| BudgetPeriod | `weekly`, `monthly` (default), `yearly` |
| BudgetState | `ok`, `warning`, `exceeded` |
| RecurringType | `income`, `expense` |
| RecurringFrequency | `daily`, `weekly`, `monthly`, `yearly` |
| RecurringStatus | `active`, `paused`, `ended` |
| RecurringRunStatus | `succeeded`, `failed`, `skipped` |
| TrendGroupBy | `day`, `week`, `month` |
| AdminUserSort | `createdAt_desc` (default), `createdAt_asc`, `email_asc`, `lastLoginAt_desc` |
| AuditTargetType | `user`, `session`, `category`, `system` |
| AuditAction | `auth.registered`, `auth.login_succeeded`, `auth.login_failed`, `auth.login_blocked_suspended`, `auth.logout`, `auth.session_reuse_detected`, `auth.password_reset_requested`, `auth.password_reset_completed`, `user.password_changed`, `admin.user_suspended`, `admin.user_reactivated`, `admin.user_role_changed`, `admin.category_created`, `admin.category_updated`, `admin.category_retired`, `admin.category_restored`, `system.admin_bootstrapped` |

### 2.2 Problem

| Field | Type |
| --- | --- |
| type | string (URI, for example `https://midas.app/problems/validation-failed`; may be `about:blank`) |
| title | string |
| status | integer |
| detail | string |
| instance | string (request path) |
| code | string (catalogue code) |
| requestId | string |
| errors | FieldError[] (present for validation and field-specific errors) |

**FieldError**

| Field | Type |
| --- | --- |
| field | string (dot path, for example `preferences.currency`) |
| code | string (for example `REQUIRED`, `TOO_SHORT`, `WEAK_PASSWORD`, `INVALID_FORMAT`, `EMAIL_TAKEN`) |
| message | string |

### 2.3 Preferences

| Field | Type |
| --- | --- |
| currency | CurrencyCode |
| locale | Locale |
| timezone | TimeZone |
| theme | Theme |

### 2.4 User (self view)

| Field | Type |
| --- | --- |
| id | Uuid |
| email | string |
| displayName | string |
| role | Role |
| status | UserStatus |
| preferences | Preferences |
| createdAt | Timestamp |
| updatedAt | Timestamp |

### 2.5 AuthSession

| Field | Type |
| --- | --- |
| accessToken | string (JWT) |
| accessTokenExpiresAt | Timestamp |
| user | User |

### 2.6 WalletRef

| Field | Type |
| --- | --- |
| id | Uuid |
| name | string |
| currency | CurrencyCode |
| archived | boolean |

### 2.7 Wallet

| Field | Type |
| --- | --- |
| id | Uuid |
| name | string (1–60) |
| type | WalletType |
| currency | CurrencyCode |
| openingBalanceMinor | SignedAmountMinor |
| balanceMinor | SignedAmountMinor (opening + income − expense − transfers out + transfers in) |
| archived | boolean |
| archivedAt | Timestamp \| null |
| hasTransactions | boolean |
| createdAt | Timestamp |
| updatedAt | Timestamp |

### 2.8 CategoryRef

| Field | Type |
| --- | --- |
| id | Uuid |
| name | string |
| type | CategoryType |
| icon | IconKey |
| color | ColorToken |
| system | boolean |
| retired | boolean |

### 2.9 Category

| Field | Type |
| --- | --- |
| id | Uuid |
| name | string (1–40) |
| type | CategoryType |
| icon | IconKey |
| color | ColorToken |
| system | boolean |
| retired | boolean (always false for user categories) |
| createdAt | Timestamp |
| updatedAt | Timestamp |

### 2.10 TransferLeg

| Field | Type |
| --- | --- |
| transferId | Uuid |
| direction | TransferDirection |
| counterpartTransactionId | Uuid |
| counterpartWallet | WalletRef |
| counterpartAmountMinor | AmountMinor |

### 2.11 Transaction

| Field | Type |
| --- | --- |
| id | Uuid |
| type | TransactionType |
| wallet | WalletRef |
| category | CategoryRef \| null (null if and only if type = transfer) |
| amountMinor | AmountMinor (always positive) |
| currency | CurrencyCode (equals wallet currency) |
| occurredOn | LocalDate |
| note | string \| null (≤ 500) |
| transfer | TransferLeg \| null (non-null if and only if type = transfer) |
| recurringTemplateId | Uuid \| null |
| createdAt | Timestamp |
| updatedAt | Timestamp |

### 2.12 Transfer

| Field | Type |
| --- | --- |
| id | Uuid |
| fromWallet | WalletRef |
| toWallet | WalletRef |
| amountMinor | AmountMinor (debited from fromWallet, in its currency) |
| toAmountMinor | AmountMinor (credited to toWallet, in its currency) |
| occurredOn | LocalDate |
| note | string \| null |
| outTransactionId | Uuid |
| inTransactionId | Uuid |
| createdAt | Timestamp |
| updatedAt | Timestamp |

### 2.13 BudgetStatus

| Field | Type |
| --- | --- |
| periodStart | LocalDate |
| periodEnd | LocalDate (inclusive) |
| spentMinor | integer (≥ 0) |
| remainingMinor | SignedAmountMinor (limit − spent; negative when over) |
| percentUsed | number (spent/limit × 100, rounded to 1 decimal, may exceed 100) |
| state | BudgetState |

### 2.14 Budget

| Field | Type |
| --- | --- |
| id | Uuid |
| scope | BudgetScope |
| category | CategoryRef \| null (null if and only if scope = overall) |
| period | BudgetPeriod |
| amountMinor | AmountMinor (limit) |
| currency | CurrencyCode |
| warningThresholdPct | integer (1–99) |
| startDate | LocalDate (normalized to period start) |
| status | BudgetStatus \| null (null if the requested period ends before startDate) |
| createdAt | Timestamp |
| updatedAt | Timestamp |

### 2.15 RecurringTemplate

| Field | Type |
| --- | --- |
| id | Uuid |
| name | string (1–60) |
| type | RecurringType |
| wallet | WalletRef |
| category | CategoryRef |
| amountMinor | AmountMinor |
| currency | CurrencyCode (wallet currency) |
| note | string \| null |
| frequency | RecurringFrequency |
| interval | integer (1–99) |
| startDate | LocalDate |
| endDate | LocalDate \| null |
| nextRunOn | LocalDate \| null (null when ended) |
| status | RecurringStatus |
| lastRunAt | Timestamp \| null |
| lastError | string \| null (error code) |
| consecutiveFailures | integer |
| createdAt | Timestamp |
| updatedAt | Timestamp |

### 2.16 RecurringRun

| Field | Type |
| --- | --- |
| id | Uuid |
| templateId | Uuid |
| occurrenceDate | LocalDate |
| status | RecurringRunStatus |
| transactionId | Uuid \| null |
| errorCode | string \| null |
| attempts | integer |
| createdAt | Timestamp |
| updatedAt | Timestamp |

### 2.17 AdminUser

| Field | Type |
| --- | --- |
| id | Uuid |
| email | string |
| displayName | string |
| role | Role |
| status | UserStatus |
| createdAt | Timestamp |
| lastLoginAt | Timestamp \| null |
| suspendedAt | Timestamp \| null |

### 2.18 AdminUserDetail (AdminUser plus these fields)

| Field | Type |
| --- | --- |
| suspendedReason | string \| null |
| activeSessionCount | integer |

### 2.19 AuditLogEntry

| Field | Type |
| --- | --- |
| id | Uuid |
| occurredAt | Timestamp |
| actor | { id: Uuid, email: string } \| null (null = system or anonymous) |
| action | AuditAction |
| target | { type: AuditTargetType, id: Uuid \| null } |
| ip | string \| null |
| userAgent | string \| null |
| requestId | string \| null |
| metadata | object (never contains passwords, tokens, amounts, notes or transaction details) |

### 2.20 PlatformMetrics

| Field | Type |
| --- | --- |
| generatedAt | Timestamp |
| users.total | integer |
| users.active30d | integer (signed in within 30 days) |
| users.new30d | integer |
| users.suspended | integer |
| users.admins | integer |
| wallets.total | integer |
| wallets.active | integer (not archived) |
| transactions.total | integer |
| transactions.last30d | integer (created within 30 days) |
| recurringTemplates.active | integer |

### 2.21 Health

| Field | Type |
| --- | --- |
| status | `ok` \| `degraded` |
| version | string |
| uptimeSeconds | integer |
| checks.database | `up` \| `down` |

---

## 3. Ops

### GET /health
- **Auth:** Public
- **Request body:** none
- **Response 200 / 503:** `Health` (503 when `checks.database = down`)
- **Errors:** none beyond 503

### GET /metrics
- **Auth:** Metrics token
- **Response 200:** Prometheus text exposition (`text/plain; version=0.0.4`)
- **Errors:** 401 (missing or invalid token), 404 (metrics disabled because `METRICS_TOKEN` is unset)

---

## 4. Auth

### POST /api/v1/auth/register
- **Auth:** Public. Rate limited.

| Field | Type | Required |
| --- | --- | --- |
| email | string (email, ≤ 254) | yes |
| password | string (12–128, zxcvbn score ≥ 3) | yes |
| displayName | string (1–80) | yes |
| currency | CurrencyCode | no (default `USD`) |
| locale | Locale | no (default `en-US`) |
| timezone | TimeZone | no (default `UTC`) |

- **Response 201:** `AuthSession` and the `Set-Cookie` refresh cookie. New users get preference `theme = system`, and system categories are immediately available.
- **Errors:** 400 VALIDATION_FAILED (field code `WEAK_PASSWORD` for password strength), 409 EMAIL_TAKEN (with `errors[0].field = "email"`)

### POST /api/v1/auth/login
- **Auth:** Public. Rate limited.

| Field | Type | Required |
| --- | --- | --- |
| email | string | yes |
| password | string | yes |

- **Response 200:** `AuthSession` (includes preferences) and the `Set-Cookie` refresh cookie
- **Errors:** 401 INVALID_CREDENTIALS (same response for an unknown email or a wrong password), 403 ACCOUNT_SUSPENDED (only after the password is verified)

### POST /api/v1/auth/refresh
- **Auth:** Refresh cookie
- **Request body:** none
- **Response 200:** `AuthSession` and a rotated `Set-Cookie`
- **Errors:** 401 SESSION_INVALID (missing, expired, revoked or reused token, or suspended user; the cookie is cleared), 403 FORBIDDEN (Origin or CSRF header check failed)

### POST /api/v1/auth/logout
- **Auth:** Refresh cookie. A bearer token is also accepted.
- **Request body:** none
- **Response 204:** session revoked, cookie cleared. Idempotent: returns 204 even if the session is already gone.
- **Errors:** 403 FORBIDDEN (Origin or CSRF header check failed)

### POST /api/v1/auth/password/forgot
- **Auth:** Public. Rate limited.

| Field | Type | Required |
| --- | --- | --- |
| email | string | yes |

- **Response 202:** identical for known and unknown emails

| Field | Type |
| --- | --- |
| status | `accepted` |

- **Errors:** 400 VALIDATION_FAILED (malformed email only)

### POST /api/v1/auth/password/reset/verify
- **Auth:** Public. Rate limited.

| Field | Type | Required |
| --- | --- | --- |
| token | string | yes |

- **Response 204:** the token is currently valid (it is not consumed)
- **Errors:** 400 RESET_TOKEN_INVALID (unknown, expired or already used)

### POST /api/v1/auth/password/reset
- **Auth:** Public. Rate limited.

| Field | Type | Required |
| --- | --- | --- |
| token | string | yes |
| newPassword | string (12–128, zxcvbn ≥ 3) | yes |

- **Response 204:** password updated, token consumed, all sessions revoked. The user must sign in again.
- **Errors:** 400 RESET_TOKEN_INVALID, 400 VALIDATION_FAILED (`WEAK_PASSWORD`)

---

## 5. Profile and Settings

### GET /api/v1/me
- **Auth:** User
- **Response 200:** `User`

### PATCH /api/v1/me
- **Auth:** User

| Field | Type | Required |
| --- | --- | --- |
| displayName | string (1–80) | no |
| preferences | object | no |
| preferences.currency | CurrencyCode | no |
| preferences.locale | Locale | no |
| preferences.timezone | TimeZone | no |
| preferences.theme | Theme | no |

- **Response 200:** `User`
- **Errors:** 400 VALIDATION_FAILED (unsupported currency, locale or timezone)

Email change is not supported in v1.

### POST /api/v1/me/password
- **Auth:** User

| Field | Type | Required |
| --- | --- | --- |
| currentPassword | string | yes |
| newPassword | string (12–128, zxcvbn ≥ 3, different from the current password) | yes |

- **Response 204:** password changed. All other sessions are revoked; the current session stays.
- **Errors:** 400 INVALID_CURRENT_PASSWORD, 400 VALIDATION_FAILED (`WEAK_PASSWORD`, `SAME_AS_CURRENT`)

---

## 6. Wallets

### GET /api/v1/wallets
- **Auth:** User
- **Query:** `includeArchived` boolean (default false)
- **Response 200:**

| Field | Type |
| --- | --- |
| items | Wallet[] (sorted by name; at most 100) |

### POST /api/v1/wallets
- **Auth:** User

| Field | Type | Required |
| --- | --- | --- |
| name | string (1–60, unique per user, case-insensitive) | yes |
| type | WalletType | yes |
| currency | CurrencyCode | no (default preference currency) |
| openingBalanceMinor | SignedAmountMinor | no (default 0) |

- **Response 201:** `Wallet`
- **Errors:** 409 WALLET_NAME_TAKEN, 409 LIMIT_REACHED

### GET /api/v1/wallets/{walletId}
- **Auth:** User
- **Response 200:** `Wallet`
- **Errors:** 404 NOT_FOUND

### PATCH /api/v1/wallets/{walletId}
- **Auth:** User

| Field | Type | Required |
| --- | --- | --- |
| name | string (1–60) | no |
| type | WalletType | no |
| currency | CurrencyCode | no (only while the wallet has no transactions and no templates) |
| openingBalanceMinor | SignedAmountMinor | no |

- **Response 200:** `Wallet`
- **Errors:** 404 NOT_FOUND, 409 WALLET_NAME_TAKEN, 409 WALLET_ARCHIVED, 409 WALLET_CURRENCY_LOCKED

### POST /api/v1/wallets/{walletId}/archive
- **Auth:** User
- **Request body:** none
- **Response 200:** `Wallet`. Idempotent. Active recurring templates on this wallet are paused.
- **Errors:** 404 NOT_FOUND

### POST /api/v1/wallets/{walletId}/unarchive
- **Auth:** User
- **Request body:** none
- **Response 200:** `Wallet`. Idempotent. Templates stay paused.
- **Errors:** 404 NOT_FOUND, 409 WALLET_NAME_TAKEN (an active wallet now uses the name)

### DELETE /api/v1/wallets/{walletId}
- **Auth:** User
- **Response 204**
- **Errors:** 404 NOT_FOUND, 409 WALLET_IN_USE (has transactions or recurring templates; archive it instead)

---

## 7. Categories

### GET /api/v1/categories
- **Auth:** User
- **Query:** `type` CategoryType (optional), `includeRetired` boolean (default false; when true, retired system categories are included)
- **Response 200:**

| Field | Type |
| --- | --- |
| items | Category[] (system and own; sorted by type, then name) |

### POST /api/v1/categories
- **Auth:** User

| Field | Type | Required |
| --- | --- | --- |
| name | string (1–40) | yes |
| type | CategoryType | yes |
| icon | IconKey | yes |
| color | ColorToken | yes |

- **Response 201:** `Category` (`system = false`)
- **Errors:** 409 CATEGORY_NAME_TAKEN (same name and type among the user's categories, case-insensitive), 409 LIMIT_REACHED (200)

### PATCH /api/v1/categories/{categoryId}
- **Auth:** User

| Field | Type | Required |
| --- | --- | --- |
| name | string (1–40) | no |
| icon | IconKey | no |
| color | ColorToken | no |

`type` cannot be changed.

- **Response 200:** `Category`
- **Errors:** 403 SYSTEM_CATEGORY_READ_ONLY, 404 NOT_FOUND, 409 CATEGORY_NAME_TAKEN

### DELETE /api/v1/categories/{categoryId}
- **Auth:** User
- **Query:** `reassignTo` Uuid (required when the category is used by transactions or recurring templates; must be an accessible, non-retired category of the same type, other than the one being deleted)
- **Response 200:**

| Field | Type |
| --- | --- |
| reassignedTransactions | integer |
| reassignedTemplates | integer |
| deletedBudgets | integer |

- **Errors:** 403 SYSTEM_CATEGORY_READ_ONLY, 404 NOT_FOUND, 409 CATEGORY_IN_USE (in use and no `reassignTo`), 422 REASSIGN_TARGET_INVALID

---

## 8. Transactions

### GET /api/v1/transactions
- **Auth:** User
- **Query:**

| Param | Type | Required |
| --- | --- | --- |
| from | LocalDate | no |
| to | LocalDate (≥ from) | no |
| walletId | Uuid (repeatable) | no |
| categoryId | Uuid (repeatable) | no |
| type | TransactionType (repeatable) | no |
| q | string (1–100; case-insensitive substring of note) | no |
| minAmountMinor | AmountMinor | no |
| maxAmountMinor | AmountMinor (≥ min) | no |
| sort | TransactionSort | no (default `date_desc`; ties broken by createdAt, then id) |
| limit | integer 1–100 | no (default 25) |
| cursor | string | no |

- **Response 200:** `CursorPage<Transaction>`. Each transfer leg appears as its own row in its wallet.
- **Errors:** 400 INVALID_CURSOR, 400 VALIDATION_FAILED (range inverted)

### POST /api/v1/transactions
- **Auth:** User
- Creates income or expense only. Use `/transfers` for transfers.

| Field | Type | Required |
| --- | --- | --- |
| type | `income` \| `expense` | yes |
| walletId | Uuid | yes |
| categoryId | Uuid | yes |
| amountMinor | AmountMinor | yes |
| occurredOn | LocalDate | yes |
| note | string (≤ 500) \| null | no |

- **Response 201:** `Transaction`
- **Errors:** 409 WALLET_ARCHIVED, 422 INVALID_REFERENCE (wallet or category not found or not accessible), 422 CATEGORY_TYPE_MISMATCH, 422 CATEGORY_RETIRED

### GET /api/v1/transactions/{transactionId}
- **Auth:** User
- **Response 200:** `Transaction`
- **Errors:** 404 NOT_FOUND

### PATCH /api/v1/transactions/{transactionId}
- **Auth:** User

| Field | Type | Required |
| --- | --- | --- |
| type | `income` \| `expense` | no (if changed, `categoryId` of the matching type is required unless the current category already matches) |
| walletId | Uuid | no (currency follows the new wallet) |
| categoryId | Uuid | no |
| amountMinor | AmountMinor | no |
| occurredOn | LocalDate | no |
| note | string (≤ 500) \| null | no |

- **Response 200:** `Transaction`. The affected wallet balances update atomically.
- **Errors:** 404 NOT_FOUND, 409 TRANSFER_LEG_IMMUTABLE (use `/transfers/{id}`), 409 WALLET_ARCHIVED (source or target wallet), 422 INVALID_REFERENCE, 422 CATEGORY_TYPE_MISMATCH, 422 CATEGORY_RETIRED (only when changing to a retired category)

### DELETE /api/v1/transactions/{transactionId}
- **Auth:** User
- **Response 204**
- **Errors:** 404 NOT_FOUND, 409 TRANSFER_LEG_IMMUTABLE, 409 WALLET_ARCHIVED

### GET /api/v1/transactions/export
- **Auth:** User. Rate limited (10/min).
- **Query:** same as `GET /transactions` except `limit` and `cursor`
- **Response 200:** `text/csv; charset=utf-8` with UTF-8 BOM, streamed. `Content-Disposition: attachment; filename="midas-transactions-YYYYMMDD.csv"`.

| Column | Content |
| --- | --- |
| date | occurredOn |
| type | income, expense or transfer |
| direction | `in` or `out` for transfers, empty otherwise |
| wallet | wallet name |
| currency | currency code |
| amount | signed decimal in major units (income and transfer in are +, expense and transfer out are −) |
| category | category name, empty for transfers |
| note | note |
| counterpart_wallet | other wallet for transfers |
| transaction_id | id |
| transfer_id | transfer id or empty |
| recurring_template_id | template id or empty |

Text cells that begin with `=`, `+`, `-`, `@`, `|`, tab, carriage return, line feed, the fullwidth forms of `=` `+` `-` `@` (U+FF1D, U+FF0B, U+FF0D, U+FF20) or the Unicode minus (U+2212) are prefixed with `'`.

Limits: one concurrent export per user (429 `RATE_LIMITED` otherwise), a process-wide cap, and an absolute time cap per export (`EXPORT_MAX_DURATION_SECONDS`). A failure after the 200 header has been sent aborts the connection, so clients see a truncated or aborted download, not a complete-looking file.

- **Errors:** 400 VALIDATION_FAILED

---

## 9. Transfers

### POST /api/v1/transfers
- **Auth:** User

| Field | Type | Required |
| --- | --- | --- |
| fromWalletId | Uuid | yes |
| toWalletId | Uuid | yes |
| amountMinor | AmountMinor (in the fromWallet currency) | yes |
| toAmountMinor | AmountMinor (in the toWallet currency) | required if the currencies differ; if they are the same, optional and must equal amountMinor |
| occurredOn | LocalDate | yes |
| note | string (≤ 500) \| null | no |

- **Response 201:** `Transfer`. Two linked transactions are created atomically.
- **Errors:** 409 WALLET_ARCHIVED, 422 INVALID_REFERENCE (wallet not found or another user's), 422 SAME_WALLET_TRANSFER, 422 TO_AMOUNT_REQUIRED, 422 TO_AMOUNT_MISMATCH

### GET /api/v1/transfers/{transferId}
- **Auth:** User
- **Response 200:** `Transfer`
- **Errors:** 404 NOT_FOUND

### PATCH /api/v1/transfers/{transferId}
- **Auth:** User

| Field | Type | Required |
| --- | --- | --- |
| fromWalletId | Uuid | no |
| toWalletId | Uuid | no |
| amountMinor | AmountMinor | no |
| toAmountMinor | AmountMinor | no (same rules as create, evaluated on the resulting state) |
| occurredOn | LocalDate | no |
| note | string (≤ 500) \| null | no |

- **Response 200:** `Transfer`. Both legs are updated atomically.
- **Errors:** 404 NOT_FOUND, 409 WALLET_ARCHIVED, 422 INVALID_REFERENCE, 422 SAME_WALLET_TRANSFER, 422 TO_AMOUNT_REQUIRED, 422 TO_AMOUNT_MISMATCH

### DELETE /api/v1/transfers/{transferId}
- **Auth:** User
- **Response 204:** both legs are deleted atomically
- **Errors:** 404 NOT_FOUND, 409 WALLET_ARCHIVED

---

## 10. Budgets

### GET /api/v1/budgets
- **Auth:** User
- **Query:** `date` LocalDate (default today in the user's timezone). Status is computed for the period that contains this date.
- **Response 200:**

| Field | Type |
| --- | --- |
| date | LocalDate |
| items | Budget[] (only budgets whose startDate ≤ the end of the requested period; at most 200) |

### POST /api/v1/budgets
- **Auth:** User

| Field | Type | Required |
| --- | --- | --- |
| scope | BudgetScope | yes |
| categoryId | Uuid (an expense category) | required if scope = category; must be absent if overall |
| period | BudgetPeriod | no (default `monthly`) |
| amountMinor | AmountMinor | yes |
| currency | CurrencyCode | no (default preference currency) |
| warningThresholdPct | integer 1–99 | no (default 80) |
| startDate | LocalDate | no (default start of the current period; normalized to the period start) |

- **Response 201:** `Budget` (status for the current period)
- **Errors:** 409 BUDGET_EXISTS (same scope, category, period and currency), 409 LIMIT_REACHED, 422 INVALID_REFERENCE, 422 CATEGORY_TYPE_MISMATCH (income category), 422 CATEGORY_RETIRED

### GET /api/v1/budgets/{budgetId}
- **Auth:** User
- **Query:** `date` LocalDate (optional)
- **Response 200:** `Budget`
- **Errors:** 404 NOT_FOUND

### PATCH /api/v1/budgets/{budgetId}
- **Auth:** User

| Field | Type | Required |
| --- | --- | --- |
| amountMinor | AmountMinor | no |
| warningThresholdPct | integer 1–99 | no |
| startDate | LocalDate | no |

Scope, category, period and currency cannot be changed; delete the budget and create a new one instead.

- **Response 200:** `Budget`
- **Errors:** 404 NOT_FOUND

### DELETE /api/v1/budgets/{budgetId}
- **Auth:** User
- **Response 204**
- **Errors:** 404 NOT_FOUND

---

## 11. Reports and Dashboard

Income and expense totals in all reports **exclude transfers**. Default range is the current calendar month in the user's timezone.

### GET /api/v1/reports/summary
- **Auth:** User
- **Query:** `from` LocalDate, `to` LocalDate (optional; range ≤ 1830 days)
- **Response 200:**

| Field | Type |
| --- | --- |
| from | LocalDate |
| to | LocalDate |
| wallets | Wallet[] (non-archived, with current balance) |
| totalsByCurrency | { currency: CurrencyCode, balanceMinor: SignedAmountMinor (current balance across non-archived wallets), incomeMinor: integer, expenseMinor: integer, netMinor: SignedAmountMinor (all within range) }[] |
| recentTransactions | Transaction[] (up to 10, within range, ordered by date_desc) |
| budgets | Budget[] (status for the period containing `to`) |

- **Errors:** 400 RANGE_TOO_LARGE

### GET /api/v1/reports/trend
- **Auth:** User
- **Query:**

| Param | Type | Required |
| --- | --- | --- |
| from | LocalDate | no |
| to | LocalDate | no |
| groupBy | TrendGroupBy | no (default `day` if range ≤ 31 days, `week` if ≤ 182 days, otherwise `month`) |
| currency | CurrencyCode | no (default preference currency) |

- **Response 200:**

| Field | Type |
| --- | --- |
| from | LocalDate |
| to | LocalDate |
| groupBy | TrendGroupBy |
| currency | CurrencyCode |
| buckets | { periodStart: LocalDate, periodEnd: LocalDate, incomeMinor: integer, expenseMinor: integer, netMinor: SignedAmountMinor }[] (every bucket in range, with empty buckets as zeros; weeks start Monday) |

- **Errors:** 400 RANGE_TOO_LARGE (more than 400 buckets)

### GET /api/v1/reports/category-breakdown
- **Auth:** User
- **Query:**

| Param | Type | Required |
| --- | --- | --- |
| from | LocalDate | no |
| to | LocalDate | no |
| type | CategoryType | no (default `expense`) |
| currency | CurrencyCode | no (default preference currency) |
| top | integer 1–20 | no (default 8) |

- **Response 200:**

| Field | Type |
| --- | --- |
| from | LocalDate |
| to | LocalDate |
| type | CategoryType |
| currency | CurrencyCode |
| totalMinor | integer |
| items | { category: CategoryRef, amountMinor: integer, percentage: number (2 decimals), transactionCount: integer }[] (descending by amount) |
| other | { amountMinor: integer, percentage: number, categoryCount: integer } \| null |

Percentages across `items` and `other` sum to exactly 100.00 when `totalMinor` > 0 (largest-remainder rounding).

- **Errors:** 400 RANGE_TOO_LARGE (range > 1830 days)

---

## 12. Recurring Templates

### GET /api/v1/recurring-templates
- **Auth:** User
- **Query:** `status` RecurringStatus (optional)
- **Response 200:**

| Field | Type |
| --- | --- |
| items | RecurringTemplate[] (sorted by nextRunOn, nulls last; at most 200) |

### POST /api/v1/recurring-templates
- **Auth:** User

| Field | Type | Required |
| --- | --- | --- |
| name | string (1–60) | yes |
| type | RecurringType | yes |
| walletId | Uuid | yes |
| categoryId | Uuid (type must match) | yes |
| amountMinor | AmountMinor | yes |
| note | string (≤ 500) \| null | no |
| frequency | RecurringFrequency | yes |
| interval | integer 1–99 | no (default 1) |
| startDate | LocalDate (≥ today − 31 days, user timezone) | yes |
| endDate | LocalDate (≥ startDate) \| null | no |

- **Response 201:** `RecurringTemplate` (status `active`)
- **Errors:** 409 WALLET_ARCHIVED, 409 LIMIT_REACHED, 422 INVALID_REFERENCE, 422 CATEGORY_TYPE_MISMATCH, 422 CATEGORY_RETIRED

### POST /api/v1/recurring-templates/preview
- **Auth:** User
- Computes occurrence dates without saving anything.

| Field | Type | Required |
| --- | --- | --- |
| frequency | RecurringFrequency | yes |
| interval | integer 1–99 | no (default 1) |
| startDate | LocalDate | yes |
| endDate | LocalDate \| null | no |
| fromDate | LocalDate | no (default today, user timezone; returns occurrences ≥ fromDate) |
| count | integer 1–24 | no (default 5) |

- **Response 200:**

| Field | Type |
| --- | --- |
| dates | LocalDate[] |

### GET /api/v1/recurring-templates/{templateId}
- **Auth:** User
- **Response 200:** `RecurringTemplate`
- **Errors:** 404 NOT_FOUND

### PATCH /api/v1/recurring-templates/{templateId}
- **Auth:** User

| Field | Type | Required |
| --- | --- | --- |
| name | string (1–60) | no |
| walletId | Uuid | no |
| categoryId | Uuid | no |
| amountMinor | AmountMinor | no |
| note | string (≤ 500) \| null | no |
| frequency | RecurringFrequency | no |
| interval | integer 1–99 | no |
| startDate | LocalDate | no |
| endDate | LocalDate \| null | no |

`type` cannot be changed. Changes affect future occurrences only. If any schedule field changes, `nextRunOn` is recomputed as the first occurrence ≥ today.

- **Response 200:** `RecurringTemplate`
- **Errors:** 404 NOT_FOUND, 409 TEMPLATE_ENDED, 409 WALLET_ARCHIVED, 422 INVALID_REFERENCE, 422 CATEGORY_TYPE_MISMATCH, 422 CATEGORY_RETIRED

### POST /api/v1/recurring-templates/{templateId}/pause
- **Auth:** User
- **Request body:** none
- **Response 200:** `RecurringTemplate` (status `paused`). Idempotent.
- **Errors:** 404 NOT_FOUND, 409 TEMPLATE_ENDED

### POST /api/v1/recurring-templates/{templateId}/resume
- **Auth:** User
- **Request body:** none
- **Response 200:** `RecurringTemplate` (status `active`; `nextRunOn` = first occurrence ≥ today; no backfill of the paused period; `consecutiveFailures` reset to 0). Idempotent.
- **Errors:** 404 NOT_FOUND, 409 TEMPLATE_ENDED, 409 WALLET_ARCHIVED, 422 CATEGORY_RETIRED

### DELETE /api/v1/recurring-templates/{templateId}
- **Auth:** User
- **Response 204:** generated transactions are kept, with `recurringTemplateId` set to null
- **Errors:** 404 NOT_FOUND

### GET /api/v1/recurring-templates/{templateId}/runs
- **Auth:** User
- **Query:** `limit`, `cursor` (newest occurrence first)
- **Response 200:** `CursorPage<RecurringRun>`
- **Errors:** 404 NOT_FOUND, 400 INVALID_CURSOR

---

## 13. Admin: Users

No admin endpoint returns wallets, transactions, budgets, templates or any per-user financial data.

### GET /api/v1/admin/users
- **Auth:** Admin
- **Query:**

| Param | Type | Required |
| --- | --- | --- |
| q | string (1–100; case-insensitive substring of email or displayName) | no |
| role | Role | no |
| status | UserStatus | no |
| sort | AdminUserSort | no |
| page | integer ≥ 1 | no |
| pageSize | integer 1–100 | no |

- **Response 200:** `OffsetPage<AdminUser>`
- **Errors:** 403 FORBIDDEN

### GET /api/v1/admin/users/{userId}
- **Auth:** Admin
- **Response 200:** `AdminUserDetail`
- **Errors:** 403 FORBIDDEN, 404 NOT_FOUND

### POST /api/v1/admin/users/{userId}/suspend
- **Auth:** Admin

| Field | Type | Required |
| --- | --- | --- |
| reason | string (≤ 500) | no |

- **Response 200:** `AdminUserDetail`. All of the user's sessions are revoked, and the action is audited (`admin.user_suspended`). Idempotent: no new audit entry if the user is already suspended.
- **Errors:** 403 FORBIDDEN, 404 NOT_FOUND, 409 CANNOT_MODIFY_SELF, 409 LAST_ADMIN

### POST /api/v1/admin/users/{userId}/reactivate
- **Auth:** Admin
- **Request body:** none
- **Response 200:** `AdminUserDetail`. Audited (`admin.user_reactivated`). Idempotent.
- **Errors:** 403 FORBIDDEN, 404 NOT_FOUND, 409 CANNOT_MODIFY_SELF

### PATCH /api/v1/admin/users/{userId}/role
- **Auth:** Admin

| Field | Type | Required |
| --- | --- | --- |
| role | Role | yes |

- **Response 200:** `AdminUserDetail`. Audited (`admin.user_role_changed`, metadata `{ from, to }`). Takes effect on the target's next request.
- **Errors:** 403 FORBIDDEN, 404 NOT_FOUND, 409 CANNOT_MODIFY_SELF, 409 LAST_ADMIN

---

## 14. Admin: System Categories

### GET /api/v1/admin/categories
- **Auth:** Admin
- **Query:** `type` CategoryType (optional), `includeRetired` boolean (default true)
- **Response 200:**

| Field | Type |
| --- | --- |
| items | Category[] (system categories only) |

- **Errors:** 403 FORBIDDEN

### POST /api/v1/admin/categories
- **Auth:** Admin

| Field | Type | Required |
| --- | --- | --- |
| name | string (1–40) | yes |
| type | CategoryType | yes |
| icon | IconKey | yes |
| color | ColorToken | yes |

- **Response 201:** `Category` (`system = true`). Audited (`admin.category_created`).
- **Errors:** 403 FORBIDDEN, 409 CATEGORY_NAME_TAKEN (among system categories of the same type)

### PATCH /api/v1/admin/categories/{categoryId}
- **Auth:** Admin

| Field | Type | Required |
| --- | --- | --- |
| name | string (1–40) | no |
| icon | IconKey | no |
| color | ColorToken | no |

- **Response 200:** `Category`. Audited (`admin.category_updated`, metadata lists the changed field names).
- **Errors:** 403 FORBIDDEN, 404 NOT_FOUND (also for user-owned categories), 409 CATEGORY_NAME_TAKEN

### POST /api/v1/admin/categories/{categoryId}/retire
- **Auth:** Admin
- **Request body:** none
- **Response 200:** `Category` (`retired = true`). It stays on existing transactions, budgets and templates and cannot be selected for new ones. Audited. Idempotent.
- **Errors:** 403 FORBIDDEN, 404 NOT_FOUND

### POST /api/v1/admin/categories/{categoryId}/restore
- **Auth:** Admin
- **Request body:** none
- **Response 200:** `Category` (`retired = false`). Audited. Idempotent.
- **Errors:** 403 FORBIDDEN, 404 NOT_FOUND, 409 CATEGORY_NAME_TAKEN

---

## 15. Admin: Metrics and Audit

### GET /api/v1/admin/metrics
- **Auth:** Admin
- **Response 200:** `PlatformMetrics` (cached for up to 5 minutes; see `generatedAt`)
- **Errors:** 403 FORBIDDEN

### GET /api/v1/admin/audit-logs
- **Auth:** Admin
- **Query:**

| Param | Type | Required |
| --- | --- | --- |
| actorId | Uuid | no |
| actorEmail | string (exact, case-insensitive) | no |
| action | AuditAction (repeatable) | no |
| targetType | AuditTargetType | no |
| targetId | Uuid | no, requires `targetType` (400 otherwise) |
| from | LocalDate (UTC day, inclusive) | no |
| to | LocalDate (UTC day, inclusive) | no |
| limit | integer 1–100 | no |
| cursor | string | no |

- **Response 200:** `CursorPage<AuditLogEntry>` (newest first)
- **Errors:** 403 FORBIDDEN, 400 INVALID_CURSOR

There are no endpoints for creating, updating or deleting audit entries.

---

## 16. Endpoint index

| Method | Path | Auth |
| --- | --- | --- |
| GET | /health | Public |
| GET | /metrics | Metrics token |
| POST | /api/v1/auth/register | Public |
| POST | /api/v1/auth/login | Public |
| POST | /api/v1/auth/refresh | Refresh cookie |
| POST | /api/v1/auth/logout | Refresh cookie |
| POST | /api/v1/auth/password/forgot | Public |
| POST | /api/v1/auth/password/reset/verify | Public |
| POST | /api/v1/auth/password/reset | Public |
| GET | /api/v1/me | User |
| PATCH | /api/v1/me | User |
| POST | /api/v1/me/password | User |
| GET | /api/v1/wallets | User |
| POST | /api/v1/wallets | User |
| GET | /api/v1/wallets/{walletId} | User |
| PATCH | /api/v1/wallets/{walletId} | User |
| POST | /api/v1/wallets/{walletId}/archive | User |
| POST | /api/v1/wallets/{walletId}/unarchive | User |
| DELETE | /api/v1/wallets/{walletId} | User |
| GET | /api/v1/categories | User |
| POST | /api/v1/categories | User |
| PATCH | /api/v1/categories/{categoryId} | User |
| DELETE | /api/v1/categories/{categoryId} | User |
| GET | /api/v1/transactions | User |
| POST | /api/v1/transactions | User |
| GET | /api/v1/transactions/export | User |
| GET | /api/v1/transactions/{transactionId} | User |
| PATCH | /api/v1/transactions/{transactionId} | User |
| DELETE | /api/v1/transactions/{transactionId} | User |
| POST | /api/v1/transfers | User |
| GET | /api/v1/transfers/{transferId} | User |
| PATCH | /api/v1/transfers/{transferId} | User |
| DELETE | /api/v1/transfers/{transferId} | User |
| GET | /api/v1/budgets | User |
| POST | /api/v1/budgets | User |
| GET | /api/v1/budgets/{budgetId} | User |
| PATCH | /api/v1/budgets/{budgetId} | User |
| DELETE | /api/v1/budgets/{budgetId} | User |
| GET | /api/v1/reports/summary | User |
| GET | /api/v1/reports/trend | User |
| GET | /api/v1/reports/category-breakdown | User |
| GET | /api/v1/recurring-templates | User |
| POST | /api/v1/recurring-templates | User |
| POST | /api/v1/recurring-templates/preview | User |
| GET | /api/v1/recurring-templates/{templateId} | User |
| PATCH | /api/v1/recurring-templates/{templateId} | User |
| POST | /api/v1/recurring-templates/{templateId}/pause | User |
| POST | /api/v1/recurring-templates/{templateId}/resume | User |
| DELETE | /api/v1/recurring-templates/{templateId} | User |
| GET | /api/v1/recurring-templates/{templateId}/runs | User |
| GET | /api/v1/admin/users | Admin |
| GET | /api/v1/admin/users/{userId} | Admin |
| POST | /api/v1/admin/users/{userId}/suspend | Admin |
| POST | /api/v1/admin/users/{userId}/reactivate | Admin |
| PATCH | /api/v1/admin/users/{userId}/role | Admin |
| GET | /api/v1/admin/categories | Admin |
| POST | /api/v1/admin/categories | Admin |
| PATCH | /api/v1/admin/categories/{categoryId} | Admin |
| POST | /api/v1/admin/categories/{categoryId}/retire | Admin |
| POST | /api/v1/admin/categories/{categoryId}/restore | Admin |
| GET | /api/v1/admin/metrics | Admin |
| GET | /api/v1/admin/audit-logs | Admin |

Route note: `/transactions/export` must be registered before `/transactions/{transactionId}`, and `/recurring-templates/preview` before `/recurring-templates/{templateId}`.

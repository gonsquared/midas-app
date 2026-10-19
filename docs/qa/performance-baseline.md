# Performance baseline

- **Story:** E10-F2-S4
- **Date:** 2026-10-19
- **Test:** `apps/api/test/perf/list-reports.perf.ts` (seed helper `apps/api/test/perf/seed.ts`), config
  `apps/api/vitest.perf.config.ts`
- **Run it:** `pnpm --filter @midas/api test:perf` (needs Docker for Testcontainers, or `TEST_DATABASE_URL`). It is not part
  of `pnpm test` or CI. Optional: `PERF_TRANSACTIONS` (default 100000), `PERF_SAMPLES` (default 20), `PERF_REPORT=<file>`
  writes the table as JSON.

## Dataset and method

- One user with **100,000 transactions** (the architecture's scale: section 1, "verified with 100k transactions for a
  single user"; no scaling down was needed), 5 USD wallets, all 29 system categories, about 10% income, dates spread over
  1,020 days ending today, 25% without a note. A second user with 20,000 transactions sits beside it so the per-user indexes
  have to do their job. Triggers stayed on, so wallet balances match the ledger. `ANALYZE` ran after the load.
- Seeding 120,000 rows with the wallet-balance and category triggers on took about 190 s.
- PostgreSQL 17 (`postgres:17-bookworm`) in Docker Desktop on a Windows 11 developer machine; the API runs in the test
  process and requests use Fastify `inject`. The numbers therefore cover routing, auth (a database check per request),
  validation, SQL and JSON serialization, **not** the network, TLS or a reverse proxy, and not concurrent load.
- Each scenario: 3 warm-up calls, then 20 timed calls, one at a time. p95 here is the 19th of 20 sorted samples, so it is
  close to the maximum; treat it as an upper-ish bound, not a statistical estimate.
- Two thresholds. **Target** is the architecture figure (section 8.3). A miss is a reported regression. **Limit** is 3 times
  the target (4 times for the dashboard fan-out) and is the only value that fails the test, because developer machines and
  Docker Desktop are noisy.

## Results (milliseconds)

| Scenario | AP | p50 | p95 | max | Target p95 | Result |
| --- | --- | --- | --- | --- | --- | --- |
| List, first page (50 rows, date desc) | AP-07 | 11.9 | 14.3 | 17.8 | 200 | within |
| List, page 2 by cursor | AP-07 | 12.1 | 15.3 | 16.0 | 200 | within |
| List, page 102 by cursor (deep keyset) | AP-07 | 12.4 | 14.7 | 15.4 | 200 | within |
| List, date ascending | AP-07 | 11.0 | 15.1 | 21.3 | 200 | within |
| List, amount descending | AP-07 | 11.8 | 24.2 | 41.9 | 200 | within |
| List, wallet filter | AP-07 | 10.7 | 13.8 | 14.0 | 200 | within |
| List, category filter | AP-07 | 10.4 | 15.1 | 16.2 | 200 | within |
| List, type filter (income) | AP-07 | 11.5 | 13.7 | 15.4 | 200 | within |
| List, one month date range | AP-07 | 10.1 | 14.9 | 17.7 | 200 | within |
| List, amount range, amount ascending | AP-07 | 10.2 | 20.3 | 37.0 | 200 | within |
| List, note search (`q`, 5 characters) | AP-07 | 12.4 | 15.2 | 15.6 | 200 | within |
| List, wallet + category + whole range + `q` | AP-07 | 10.3 | 13.9 | 19.6 | 200 | within |
| Wallets with balances | AP-05 | 7.3 | 9.4 | 9.5 | 50 | within |
| Reports summary, current month | AP-09 | 14.6 | 16.5 | 16.9 | 300 | within |
| Reports summary, whole dataset | AP-09 | 38.0 | 49.3 | 49.3 | 300 | within |
| Reports trend, last 390 days by day | AP-09 | 32.4 | 43.8 | 55.9 | 300 | within |
| Reports trend, whole dataset by week | AP-09 | 55.6 | 66.7 | 77.2 | 300 | within |
| Reports trend, whole dataset by month | AP-09 | 48.0 | 68.9 | 69.4 | 300 | within |
| Reports trend, current month | AP-09 | 8.5 | 10.9 | 14.4 | 300 | within |
| Category breakdown, whole dataset (top 8) | AP-09 | 56.5 | 66.9 | 72.9 | 300 | within |
| Category breakdown, income, one year | AP-09 | 23.1 | 33.7 | 39.7 | 300 | within |
| Budgets list with status | AP-09 | 10.7 | 14.2 | 14.4 | 300 | within |
| Dashboard fan-out (6 calls at once) | AP-09 | 21.2 | 25.2 | 29.7 | 300 | within |
| CSV export of all 100,000 rows (one run) | AP-08 | 4,728 total | | | constant memory | 9.9 MiB streamed, 100,001 lines, process RSS grew 30 to 63 MiB across two runs |

**Regressions against the architecture targets: none.** Every list, report, dashboard and wallet query is at least 8 times
faster than its target on this dataset (worst case: the weekly trend at 67 ms against 300 ms). Index use for the list and
report queries is also asserted by `transactions-explain.int.test.ts` and `reports-explain.int.test.ts` (no sequential scan
on `transactions`).

Product limits seen while writing the test (not defects): a trend may hold at most 400 buckets (`range-too-large`), so a
daily trend covers about a year at most, and report ranges are capped at 1,830 days.

## Thresholds the test enforces

| Scenario group | Fails the run when p95 is at or above |
| --- | --- |
| List (AP-07) | 600 ms |
| Wallets (AP-05) | 150 ms |
| Reports and budgets (AP-09) | 900 ms |
| Dashboard fan-out | 1,200 ms |
| Export | 60 s total, and RSS growth above the larger of 200 MiB or twice the file size |

The measured values are 10 to 40 times under these limits, so a failure means a real change (a dropped index, a plan flip
or an N+1), not noise. To tighten them, lower `limit` in `measure()` once a few runs on the CI hardware are recorded.

## What was not measured

- **Concurrent load.** No autocannon run (architecture section 11 mentions `e2e/perf/` scripts): all calls were sequential,
  so connection-pool contention and the rate limiters under load are untested.
- AP-13 admin user search at 50,000 users and AP-14 audit queries at 5,000,000 rows: not seeded. The audit and user tables
  were not scaled in this run.
- AP-01 to AP-03 (login lookup, per-request auth check, refresh rotation) in isolation: they are inside every number above
  (each request does the auth check), and every request stayed under about 25 ms, but they were not timed separately.
- The browser: bundle size and render time. The production build has one large chunk (`password-*.js`, about 1.66 MB
  minified, about 850 KB gzip, probably the password strength dictionary) and the dashboard chart chunk (about 374 KB). Whether
  each is loaded only when needed was not checked. No bundle-size budget exists or is tested.
- Network, TLS and a reverse proxy; the hosted environment's database sizing.

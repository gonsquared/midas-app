# 12. Budgets use calendar periods, monthly by default, with an 80% warning threshold

- **Status:** Accepted
- **Date:** 2026-10-16
- **Source:** mirrored from `docs/architecture.md` section 14 (ADR-012)

- **Decision:** weekly (ISO Monday), monthly (default) and yearly calendar-aligned periods; overall or per-expense-category scope; per-currency; per-budget threshold of 1 to 99 (default 80); states `ok`, `warning` and `exceeded`, with exceeded at 100% or more; computed on read.
- **Alternatives rejected:** custom period start days (for example pay-day cycles), deferred because they complicate period math and the UI; stored per-period budget instances (duplication with little value in v1); exceeded only when strictly over 100% (users expect "limit reached" to be flagged).
- **Consequences:** simple and deterministic. Limit edits are retroactive (R6).

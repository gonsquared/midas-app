# 8. Multi-currency policy

- **Status:** Accepted
- **Date:** 2026-10-16
- **Source:** mirrored from `docs/architecture.md` section 14 (ADR-008)

- **Decision:** a single currency per wallet, locked once used; no FX; cross-currency transfers require an explicit destination amount; totals per currency; reports and budgets in one currency each; the preference currency is only a default.
- **Alternatives rejected:** single currency per user (too limiting); automatic FX conversion (needs an external rates provider, historical rates and rounding policy, out of scope); rejecting all cross-currency transfers (blocks a common real-world need when an explicit amount solves it).
- **Consequences:** the books are always exact, with no rate drift. There is no consolidated net worth across currencies in v1 (R3).

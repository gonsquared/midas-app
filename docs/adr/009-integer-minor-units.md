# 9. Integer minor units

- **Status:** Accepted
- **Date:** 2026-10-16
- **Source:** mirrored from `docs/architecture.md` section 14 (ADR-009)

- **Decision:** `amountMinor` integers using ISO 4217 exponents from the shared currency table; at most 10^14 in absolute value; positive transaction amounts with direction from type; signed balances; percentages computed with integer math and rounded only for display (largest-remainder method so breakdowns sum to 100).
- **Alternatives rejected:** decimal strings in the API (heavier for clients); floats (rounding errors).
- **Consequences:** clients must divide by the currency exponent for display, and shared helpers do this.

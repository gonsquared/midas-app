# 17. Date-only ledger with a timezone per user

- **Status:** Accepted
- **Date:** 2026-10-16
- **Source:** mirrored from `docs/architecture.md` section 14 (ADR-017)

- **Decision:** `occurredOn` and all period math use calendar dates; users have an IANA timezone used to compute "today"; system timestamps are UTC.
- **Alternatives rejected:** timestamps for transactions (day-boundary bugs across timezones; no product need for a time of day); server-timezone "today" (wrong for users far from UTC).
- **Consequences:** reports group by date with no timezone conversion. The scheduler evaluates due dates per user timezone.

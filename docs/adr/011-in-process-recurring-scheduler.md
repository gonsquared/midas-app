# 11. Recurring scheduler runs in process and is coordinated through the database

- **Status:** Accepted
- **Date:** 2026-10-16
- **Source:** mirrored from `docs/architecture.md` section 14 (ADR-011)

- **Decision:** a timer every `SCHEDULER_INTERVAL_SECONDS` (default 300). It claims due templates in batches with row locks that skip locked rows, generates each occurrence in its own database transaction, and uses unique (templateId, occurrenceDate) as the idempotency guard. Catch-up, pause, failure and retry policy are in §2.4. The same job runs from `worker.ts` or as a one-off CLI tick. The scheduler also runs daily housekeeping (AP-17) and the `BOOTSTRAP_ADMIN_EMAIL` check at boot.
- **Alternatives rejected:**
  - Redis-backed queue (BullMQ): extra infrastructure, against the one-database deployment goal.
  - Database-backed job library (for example pg-boss): viable, but it ties the design to one engine before db-agent decides, and it is more than a single periodic job needs. It can be revisited.
  - External cron only: not available on every host, and harder to test.
  - Generating on read when the user opens the app: transactions would be missing from reports until the user visits, and it adds hidden write paths.
- **Consequences:** no extra services, and it is safe to run concurrently. Testing relies on the injected `Clock`. Tick latency means generation can be up to 5 minutes after the start of a user's day.

# 10. Email provider abstraction

- **Status:** Accepted
- **Date:** 2026-10-16
- **Source:** mirrored from `docs/architecture.md` section 14 (ADR-010)

- **Decision:** a `Mailer` port with `smtp`, `console` and `memory` adapters; Mailpit for local development; asynchronous sending after the response; templates in the repository.
- **Alternatives rejected:** a vendor HTTP SDK as the primary adapter (lock-in; SMTP is universal); a transactional outbox table (more than v1 needs; R8 accepted).
- **Consequences:** any SMTP provider works through environment configuration. End-to-end tests read reset emails from Mailpit.

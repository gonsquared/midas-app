# 16. Database engine

- **Status:** Accepted
- **Date:** 2026-10-16
- **Source:** mirrored from `docs/architecture.md` section 14 (ADR-016)

- **Status:** Accepted. Resolved by db-agent in [docs/database.md](./database.md) (§2 and DB-ADR-01): PostgreSQL 17 with Kysely on `pg` and node-pg-migrate. Requirements remain in §8.
- **Decision owner:** db-agent (E1-F2-S3). The query layer and migration tooling satisfy the up/down migration and raw-SQL requirements in §8.1. See docs/database.md for alternatives rejected and consequences.

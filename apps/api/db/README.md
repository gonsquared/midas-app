# Database (apps/api/db)

Authoritative design: database design notes. This folder holds the migration and seed assets.

- `migrations/` node-pg-migrate files named `<UTC timestamp, 17 digits>_<verb>-<object>.ts`, each exporting
  `up()` and `down()`, written as reviewed SQL through `pgm.sql()`. A merged migration is never edited.
  Each migration starts with `SET LOCAL lock_timeout = '5s'`. One transaction per migration.
- `seeds/` seed data modules, separate from migrations (section 12).
- `roles/roles.template.sql` operator template for the `midas_app` and `midas_maintenance` roles.

## Conventions (summary of database design notes section 4)

- Tables `snake_case` plural; columns `snake_case` (camelCase in TypeScript via `CamelCasePlugin`).
- Constraint names: `pk_`, `fk_<table>__<target>`, `uq_`, `ck_<table>__<rule>`, `ix_`, `tg_`, `ct_`.
  Names are part of the error mapping contract (section 7.12).
- Ids are `uuid`, generated in the application as UUIDv7.
- Timestamps are `timestamptz(3)`; `created_at`/`updated_at` on mutable tables (`set_updated_at()` trigger).
- Enum-like values are `text` with `CHECK (col IN (...))`, matching `packages/shared` enums.
- Money is `bigint` in minor units with a `_minor` suffix, next to a `currency` column.

## Commands (from the repo root)

```
pnpm --filter @midas/api migrate                 # apply pending migrations (DATABASE_MIGRATION_URL)
pnpm --filter @midas/api migrate:down -- --count 1
pnpm --filter @midas/api migrate:status
pnpm --filter @midas/api migrate:verify          # up, snapshot, down to zero, up, compare
pnpm --filter @midas/api db:migrate:create <name>
pnpm --filter @midas/api db:codegen              # regenerate src/platform/db/database.generated.ts
pnpm --filter @midas/api seed:system             # idempotent system categories (run after migrate)
```

## Setup, Docker and backup notes

- Migrations and `seed:system` connect through `DATABASE_MIGRATION_URL` (owner role); the app uses `DATABASE_URL` (`midas_app`).
- `docker compose up` starts PostgreSQL 17, then the one-shot `migrate` service (runs `migrate` and `seed:system`), then the API.
  `docker compose down -v` deletes the database volume.
- Release procedure: run `migrate` and `seed:system` before starting the new image (database design notes 11.7).
- Local backup: `docker compose exec db pg_dump -U midas_owner -Fc midas > midas.dump`; restore with
  `docker compose exec -T db pg_restore -U midas_owner -d midas --clean --if-exists < midas.dump`.
  Production backup and restore (PITR, encrypted dumps, restore into a new instance) is in `docs/database.md` section 14.
- `db:check` is planned and not implemented. TODO: `docs/operations/runbook.md` does not exist yet.

## Migrations so far (database design notes 11.2)

| #   | File                                                   | Story    |
| --- | ------------------------------------------------------ | -------- |
| 1   | `20261016090000000_extensions-and-functions`           | E1-F2-S3 |
| 2   | `20261016090100000_create-auth-tables`                 | E2-F1-S1 |
| 3   | `20261017090000000_create-wallets`                     | E3-F1-S1 |
| 4   | `20261017090100000_create-categories`                  | E4-F1-S1 |
| 5   | `20261017090200000_create-transfers-and-transactions`  | E5-F1-S1 |

Integration tests that exercise constraints and triggers need PostgreSQL 17 (Testcontainers or
`TEST_DATABASE_URL`). PGlite is PostgreSQL 18 and differs: `ON DELETE RESTRICT` reports SQLSTATE 23001
instead of 23503, and the PGlite socket server loses protocol sync after an error on a Kysely query.

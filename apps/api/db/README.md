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
```

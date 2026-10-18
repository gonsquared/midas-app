# Seeds

Seeds are TypeScript modules run only by the API CLI (`seed:*` commands, database design notes section 12).
They are idempotent, never imported by migrations, and are not tracked in `schema_migrations`.
Migrations never insert data and seeds never change schema.

## `seed:system` (`system-categories.ts`)

```
pnpm --filter @midas/api seed:system
```

- Inserts the shared system categories (`owner_user_id IS NULL`). They are not copied per user, so every
  user, including one registered a second ago, sees them through the category list query.
- Idempotent: one `INSERT … ON CONFLICT DO NOTHING` keyed by `system_key`. Existing rows are never updated,
  retired or deleted, so admin edits survive reruns, and concurrent runs are safe.
- Validates every entry against the database checks and the `@midas/shared` icon and color allowlists
  before touching the database, and fails fast on a problem.
- If an admin already created an unkeyed system category with the same type and name, that key is skipped
  with a warning.
- Connects through `DATABASE_MIGRATION_URL` (owner role). Runs after `migrate` in every release and in the
  Compose `migrate` service.
- To add a default, append an entry with a new key and rerun. Never change or reuse an existing key.

`seed:dev` and `seed:perf` are not built yet.

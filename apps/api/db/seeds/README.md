# Seeds

Seeds are TypeScript modules run only by the API CLI (`seed:*` commands, database design notes section 12).
They are idempotent, never imported by migrations, and are not tracked in `schema_migrations`.
Migrations never insert data and seeds never change schema.

No seed exists yet. `seed:system` (system categories) lands with the categories story.

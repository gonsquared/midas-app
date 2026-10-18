import type { MigrationBuilder } from 'node-pg-migrate';

// database design notes 5, 7.9, 8 (AP-09, AP-12), 9.3 and 11.2 (#6). Story E6-F1-S1.
// Additive: one new table. Spent amounts are computed on read (ADR-012), so there are no
// per-period rows. Table privileges for midas_app come from migration 1 (default privileges).
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`SET LOCAL lock_timeout = '5s'`);

  pgm.sql(`
    CREATE TABLE budgets (
      id                    uuid           NOT NULL DEFAULT gen_random_uuid(),
      user_id               uuid           NOT NULL,
      scope                 text           NOT NULL,
      category_id           uuid           NULL,
      period                text           NOT NULL DEFAULT 'monthly',
      amount_minor          bigint         NOT NULL,
      currency              text           NOT NULL,
      warning_threshold_pct smallint       NOT NULL DEFAULT 80,
      start_date            date           NOT NULL,
      created_at            timestamptz(3) NOT NULL DEFAULT now(),
      updated_at            timestamptz(3) NOT NULL DEFAULT now(),
      CONSTRAINT pk_budgets PRIMARY KEY (id),
      CONSTRAINT fk_budgets__user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
      CONSTRAINT fk_budgets__category FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE RESTRICT,
      CONSTRAINT ck_budgets__scope CHECK (scope IN ('overall', 'category')),
      CONSTRAINT ck_budgets__scope_shape CHECK ((scope = 'overall') = (category_id IS NULL)),
      CONSTRAINT ck_budgets__period CHECK (period IN ('weekly', 'monthly', 'yearly')),
      CONSTRAINT ck_budgets__amount_range CHECK (amount_minor BETWEEN 1 AND 100000000000000),
      CONSTRAINT ck_budgets__currency CHECK (currency ~ '^[A-Z]{3}$'),
      CONSTRAINT ck_budgets__threshold CHECK (warning_threshold_pct BETWEEN 1 AND 99),
      CONSTRAINT ck_budgets__start_date_range CHECK (start_date BETWEEN DATE '1900-01-01' AND DATE '2100-12-31'),
      CONSTRAINT ck_budgets__start_date_aligned CHECK (
           (period = 'monthly' AND extract(day FROM start_date) = 1)
        OR (period = 'yearly'  AND extract(month FROM start_date) = 1 AND extract(day FROM start_date) = 1)
        OR (period = 'weekly'  AND extract(isodow FROM start_date) = 1))
    )
  `);
  // One budget per (user, category or overall, period, currency): BUDGET_EXISTS. NULLS NOT
  // DISTINCT (PostgreSQL 15+) makes every overall budget (null category) collide with the next,
  // so one index covers both scopes. It leads with user_id, so it also supports fk_budgets__user.
  pgm.sql(`
    CREATE UNIQUE INDEX uq_budgets__user_category_period_currency
      ON budgets (user_id, category_id, period, currency) NULLS NOT DISTINCT
  `);
  // AP-12 (delete a category's budgets) and FK support for category delete (CATEGORY_IN_USE).
  pgm.sql(
    `CREATE INDEX ix_budgets__category_id ON budgets (category_id) WHERE category_id IS NOT NULL`,
  );
  pgm.sql(`
    CREATE TRIGGER tg_budgets__updated_at BEFORE UPDATE ON budgets
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);
  // Tenant isolation: the category must be a system category or the budget owner's
  // (fk_category_accessible). The expense-only rule is a service check (CATEGORY_TYPE_MISMATCH).
  pgm.sql(`
    CREATE TRIGGER tg_budgets__category_accessible
      BEFORE INSERT OR UPDATE OF category_id, user_id ON budgets
      FOR EACH ROW EXECUTE FUNCTION assert_category_accessible()
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`SET LOCAL lock_timeout = '5s'`);
  // DESTRUCTIVE in a populated database: budget rows are not restored (database design notes
  // 11.6). Dropping the table also drops its indexes and triggers; the shared functions stay.
  pgm.sql(`DROP TABLE IF EXISTS budgets`);
}

import type { MigrationBuilder } from 'node-pg-migrate';

// database design notes 6.3, 7.8, 7.10, 8 (AP-10, AP-11, AP-18), 9 (C-03, C-09), 10.5, 13.1 and
// 11.2 (#7). Story E8-F1-S1.
// Additive. Creates recurring_templates and recurring_runs, then expands the existing transactions
// table with a nullable recurring_template_id link (the expand pattern of 11.4). Adding a nullable
// column without a default is metadata-only; the new foreign key and check are validated against
// a column that is null on every existing row. Before the first production release every table is
// empty outside developer machines (11.2), so the index is built inside the migration transaction.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`SET LOCAL lock_timeout = '5s'`);

  pgm.sql(`
    CREATE TABLE recurring_templates (
      id                   uuid           NOT NULL DEFAULT gen_random_uuid(),
      user_id              uuid           NOT NULL,
      name                 text           NOT NULL,
      type                 text           NOT NULL,
      wallet_id            uuid           NOT NULL,
      category_id          uuid           NOT NULL,
      amount_minor         bigint         NOT NULL,
      note                 text           NULL,
      frequency            text           NOT NULL,
      interval_count       smallint       NOT NULL DEFAULT 1,
      start_date           date           NOT NULL,
      end_date             date           NULL,
      next_run_on          date           NULL,
      status               text           NOT NULL DEFAULT 'active',
      consecutive_failures smallint       NOT NULL DEFAULT 0,
      last_run_at          timestamptz(3) NULL,
      last_error           text           NULL,
      created_at           timestamptz(3) NOT NULL DEFAULT now(),
      updated_at           timestamptz(3) NOT NULL DEFAULT now(),
      CONSTRAINT pk_recurring_templates PRIMARY KEY (id),
      CONSTRAINT fk_recurring_templates__user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
      CONSTRAINT fk_recurring_templates__wallet FOREIGN KEY (wallet_id, user_id)
        REFERENCES wallets (id, user_id) ON DELETE RESTRICT,
      CONSTRAINT fk_recurring_templates__category FOREIGN KEY (category_id, type)
        REFERENCES categories (id, type) ON DELETE RESTRICT ON UPDATE RESTRICT,
      CONSTRAINT uq_recurring_templates__id_user UNIQUE (id, user_id),
      CONSTRAINT ck_recurring_templates__name CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 60),
      CONSTRAINT ck_recurring_templates__type CHECK (type IN ('income', 'expense')),
      CONSTRAINT ck_recurring_templates__amount_range CHECK (amount_minor BETWEEN 1 AND 100000000000000),
      CONSTRAINT ck_recurring_templates__note CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 500),
      CONSTRAINT ck_recurring_templates__frequency CHECK (frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
      CONSTRAINT ck_recurring_templates__interval CHECK (interval_count BETWEEN 1 AND 99),
      CONSTRAINT ck_recurring_templates__dates CHECK (
        start_date BETWEEN DATE '1900-01-01' AND DATE '2100-12-31'
        AND (end_date IS NULL OR (end_date >= start_date AND end_date <= DATE '2100-12-31'))),
      CONSTRAINT ck_recurring_templates__status CHECK (status IN ('active', 'paused', 'ended')),
      CONSTRAINT ck_recurring_templates__next_run CHECK ((status = 'ended') = (next_run_on IS NULL)),
      CONSTRAINT ck_recurring_templates__failures CHECK (consecutive_failures >= 0),
      CONSTRAINT ck_recurring_templates__last_error CHECK (last_error IS NULL OR last_error ~ '^[A-Z][A-Z0-9_]{0,63}$')
    )
  `);
  // AP-10 due-template claim (ORDER BY next_run_on, id ... FOR UPDATE SKIP LOCKED); also serves
  // the "active templates" platform metric (AP-15).
  pgm.sql(`
    CREATE INDEX ix_recurring_templates__due ON recurring_templates (next_run_on, id)
      WHERE status = 'active'
  `);
  // Owner list and FK support for fk_recurring_templates__user.
  pgm.sql(`CREATE INDEX ix_recurring_templates__user_id ON recurring_templates (user_id)`);
  // AP-18 wallet-in-use probe, pause-on-archive, FK support for wallet delete (WALLET_IN_USE).
  pgm.sql(`CREATE INDEX ix_recurring_templates__wallet_id ON recurring_templates (wallet_id)`);
  // AP-12 category in use and bulk reassign, FK support for category delete (CATEGORY_IN_USE).
  pgm.sql(`CREATE INDEX ix_recurring_templates__category_id ON recurring_templates (category_id)`);
  pgm.sql(`
    CREATE TRIGGER tg_recurring_templates__updated_at BEFORE UPDATE ON recurring_templates
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);
  pgm.sql(`
    CREATE TRIGGER tg_recurring_templates__category_accessible
      BEFORE INSERT OR UPDATE OF category_id, user_id ON recurring_templates
      FOR EACH ROW EXECUTE FUNCTION assert_category_accessible()
  `);

  // One row per (template, occurrence date): the idempotency key of the scheduler (AP-11, C-03).
  // Scanned backwards, uq_recurring_runs__template_occurrence also serves the newest-first run
  // list of one template, and it supports fk_recurring_runs__template.
  pgm.sql(`
    CREATE TABLE recurring_runs (
      id              uuid           NOT NULL DEFAULT gen_random_uuid(),
      template_id     uuid           NOT NULL,
      occurrence_date date           NOT NULL,
      status          text           NOT NULL,
      transaction_id  uuid           NULL,
      error_code      text           NULL,
      attempts        smallint       NOT NULL DEFAULT 1,
      created_at      timestamptz(3) NOT NULL DEFAULT now(),
      updated_at      timestamptz(3) NOT NULL DEFAULT now(),
      CONSTRAINT pk_recurring_runs PRIMARY KEY (id),
      CONSTRAINT fk_recurring_runs__template FOREIGN KEY (template_id)
        REFERENCES recurring_templates (id) ON DELETE CASCADE,
      CONSTRAINT fk_recurring_runs__transaction FOREIGN KEY (transaction_id)
        REFERENCES transactions (id) ON DELETE SET NULL,
      CONSTRAINT uq_recurring_runs__template_occurrence UNIQUE (template_id, occurrence_date),
      CONSTRAINT ck_recurring_runs__status CHECK (status IN ('succeeded', 'failed', 'skipped')),
      CONSTRAINT ck_recurring_runs__transaction_shape CHECK (status = 'succeeded' OR transaction_id IS NULL),
      CONSTRAINT ck_recurring_runs__error_shape CHECK ((status = 'succeeded') = (error_code IS NULL)),
      CONSTRAINT ck_recurring_runs__error_code CHECK (error_code IS NULL OR error_code ~ '^[A-Z][A-Z0-9_]{0,63}$'),
      CONSTRAINT ck_recurring_runs__attempts CHECK (attempts >= 1)
    )
  `);
  // A transaction is produced by at most one run; FK support for fk_recurring_runs__transaction
  // (deleting a generated transaction keeps its run, so the occurrence is not regenerated).
  pgm.sql(`
    CREATE UNIQUE INDEX uq_recurring_runs__transaction ON recurring_runs (transaction_id)
      WHERE transaction_id IS NOT NULL
  `);
  pgm.sql(`
    CREATE TRIGGER tg_recurring_runs__updated_at BEFORE UPDATE ON recurring_runs
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  // Expand transactions (7.8). The link includes user_id, so a generated transaction can only
  // point at a template of the same user. Deleting a template keeps the transactions and clears
  // only the link column (PostgreSQL 15+ column list), never user_id (C-09).
  pgm.sql(`ALTER TABLE transactions ADD COLUMN recurring_template_id uuid NULL`);
  pgm.sql(`
    ALTER TABLE transactions
      ADD CONSTRAINT fk_transactions__recurring_template FOREIGN KEY (recurring_template_id, user_id)
        REFERENCES recurring_templates (id, user_id) ON DELETE SET NULL (recurring_template_id),
      ADD CONSTRAINT ck_transactions__recurring_type CHECK (recurring_template_id IS NULL OR type <> 'transfer')
  `);
  // FK support for template delete (SET NULL); partial, so ordinary rows add no index entries.
  pgm.sql(`
    CREATE INDEX ix_transactions__recurring_template ON transactions (recurring_template_id)
      WHERE recurring_template_id IS NOT NULL
  `);

  // Retention purge of runs older than 400 days (10.5) runs as midas_maintenance (13.1). Roles are
  // created outside migrations (db/roles/roles.template.sql), so grant only if present.
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'midas_maintenance') THEN
        GRANT SELECT, DELETE ON recurring_runs TO midas_maintenance;
      END IF;
    END $$
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`SET LOCAL lock_timeout = '5s'`);
  // DESTRUCTIVE in a populated database (database design notes 11.6): templates, run history and
  // the transaction-to-template links are not restored. Generated transactions themselves stay.
  // Contract transactions first, so nothing references recurring_templates when it is dropped.
  pgm.sql(`DROP INDEX IF EXISTS ix_transactions__recurring_template`);
  pgm.sql(`
    ALTER TABLE transactions
      DROP CONSTRAINT IF EXISTS ck_transactions__recurring_type,
      DROP CONSTRAINT IF EXISTS fk_transactions__recurring_template
  `);
  pgm.sql(`ALTER TABLE transactions DROP COLUMN IF EXISTS recurring_template_id`);
  // Dropping the tables also drops their indexes, triggers and the midas_maintenance grant.
  pgm.sql(`DROP TABLE IF EXISTS recurring_runs`);
  pgm.sql(`DROP TABLE IF EXISTS recurring_templates`);
}

import type { MigrationBuilder } from 'node-pg-migrate';

// database design notes 6.3, 7.6 and 11.2 (#4). Story E4-F1-S1.
// Additive: a new table and function. System rows are inserted by `cli seed:system`, never here
// (database design notes 12: migrations never insert data).
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`SET LOCAL lock_timeout = '5s'`);

  pgm.sql(`
    CREATE TABLE categories (
      id            uuid           NOT NULL DEFAULT gen_random_uuid(),
      owner_user_id uuid           NULL,
      system_key    text           NULL,
      name          text           NOT NULL,
      type          text           NOT NULL,
      icon          text           NOT NULL,
      color         text           NOT NULL,
      retired_at    timestamptz(3) NULL,
      created_at    timestamptz(3) NOT NULL DEFAULT now(),
      updated_at    timestamptz(3) NOT NULL DEFAULT now(),
      CONSTRAINT pk_categories PRIMARY KEY (id),
      CONSTRAINT fk_categories__owner FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT,
      CONSTRAINT uq_categories__id_type UNIQUE (id, type),
      CONSTRAINT uq_categories__system_key UNIQUE (system_key),
      CONSTRAINT ck_categories__name CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 40),
      CONSTRAINT ck_categories__type CHECK (type IN ('income', 'expense')),
      CONSTRAINT ck_categories__icon CHECK (icon ~ '^[a-z0-9-]{1,40}$'),
      CONSTRAINT ck_categories__color CHECK (color ~ '^[a-z0-9-]{1,40}$'),
      CONSTRAINT ck_categories__system_only_fields CHECK (owner_user_id IS NULL OR (retired_at IS NULL AND system_key IS NULL)),
      CONSTRAINT ck_categories__system_key CHECK (system_key IS NULL OR system_key ~ '^(income|expense)[.][a-z0-9_]{1,40}$')
    )
  `);
  // System names: unique per type among non-retired system rows (CATEGORY_NAME_TAKEN).
  pgm.sql(`
    CREATE UNIQUE INDEX uq_categories__system_type_name_active ON categories (type, lower(name))
      WHERE owner_user_id IS NULL AND retired_at IS NULL
  `);
  // User names: unique per owner and type (CATEGORY_NAME_TAKEN).
  pgm.sql(`
    CREATE UNIQUE INDEX uq_categories__owner_type_name ON categories (owner_user_id, type, lower(name))
      WHERE owner_user_id IS NOT NULL
  `);
  // AP-06 (own categories by type); FK support for fk_categories__owner.
  pgm.sql(`
    CREATE INDEX ix_categories__owner_type ON categories (owner_user_id, type)
      WHERE owner_user_id IS NOT NULL
  `);
  // AP-06 (system categories by type).
  pgm.sql(
    `CREATE INDEX ix_categories__system_type ON categories (type) WHERE owner_user_id IS NULL`,
  );
  pgm.sql(`
    CREATE TRIGGER tg_categories__updated_at BEFORE UPDATE ON categories
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);
  // The owner is fixed at insert. Moving a row between users (or between user and system) would
  // silently re-scope every transaction that references it, which assert_category_accessible
  // only checks when the referencing row is written, so it is rejected here for every role.
  pgm.sql(`
    CREATE FUNCTION forbid_category_owner_change() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'categories.owner_user_id cannot change (category %)', OLD.id
        USING ERRCODE = 'check_violation', CONSTRAINT = 'ck_categories__owner_immutable';
    END $$
  `);
  pgm.sql(`
    CREATE TRIGGER tg_categories__owner_immutable BEFORE UPDATE OF owner_user_id ON categories
      FOR EACH ROW WHEN (OLD.owner_user_id IS DISTINCT FROM NEW.owner_user_id)
      EXECUTE FUNCTION forbid_category_owner_change()
  `);

  // A referenced category must be a system category or belong to the row owner. A plain foreign
  // key cannot express "null owner or same owner" (database design notes 6.3). Attached to
  // transactions (E5-F1-S1), recurring_templates and budgets by their own migrations.
  pgm.sql(`
    CREATE FUNCTION assert_category_accessible() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.category_id IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM categories c
            WHERE c.id = NEW.category_id
              AND (c.owner_user_id IS NULL OR c.owner_user_id = NEW.user_id)) THEN
        RAISE EXCEPTION 'category % is not accessible to user %', NEW.category_id, NEW.user_id
          USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'fk_category_accessible';
      END IF;
      RETURN NEW;
    END $$
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`SET LOCAL lock_timeout = '5s'`);
  // DESTRUCTIVE in a populated database: user categories and admin edits to system categories
  // are not restored; rerun `cli seed:system` after re-applying (database design notes 11.6).
  pgm.sql(`DROP FUNCTION IF EXISTS assert_category_accessible()`);
  pgm.sql(`DROP TABLE IF EXISTS categories`);
  pgm.sql(`DROP FUNCTION IF EXISTS forbid_category_owner_change()`);
}

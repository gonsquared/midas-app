import type { MigrationBuilder } from 'node-pg-migrate';

// database design notes 5, 7.5 and 11.2 (#3). Story E3-F1-S1.
// Additive: a new table only, so it is compatible with the currently deployed version (11.3).
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`SET LOCAL lock_timeout = '5s'`);

  pgm.sql(`
    CREATE TABLE wallets (
      id                    uuid           NOT NULL DEFAULT gen_random_uuid(),
      user_id               uuid           NOT NULL,
      name                  text           NOT NULL,
      type                  text           NOT NULL,
      currency              text           NOT NULL,
      opening_balance_minor bigint         NOT NULL DEFAULT 0,
      ledger_balance_minor  bigint         NOT NULL DEFAULT 0,
      archived_at           timestamptz(3) NULL,
      created_at            timestamptz(3) NOT NULL DEFAULT now(),
      updated_at            timestamptz(3) NOT NULL DEFAULT now(),
      CONSTRAINT pk_wallets PRIMARY KEY (id),
      CONSTRAINT fk_wallets__user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
      CONSTRAINT uq_wallets__id_user UNIQUE (id, user_id),
      CONSTRAINT uq_wallets__id_user_currency UNIQUE (id, user_id, currency),
      CONSTRAINT ck_wallets__name CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 60),
      CONSTRAINT ck_wallets__type CHECK (type IN ('cash', 'bank', 'card', 'savings')),
      CONSTRAINT ck_wallets__currency CHECK (currency ~ '^[A-Z]{3}$'),
      CONSTRAINT ck_wallets__opening_balance_range CHECK (opening_balance_minor BETWEEN -100000000000000 AND 100000000000000),
      CONSTRAINT ck_wallets__balance_range CHECK (opening_balance_minor + ledger_balance_minor BETWEEN -100000000000000 AND 100000000000000)
    )
  `);
  // Case-insensitive name uniqueness among active wallets only (WALLET_NAME_TAKEN).
  pgm.sql(`
    CREATE UNIQUE INDEX uq_wallets__user_name_active ON wallets (user_id, lower(name))
      WHERE archived_at IS NULL
  `);
  // AP-05 wallet list; FK support for fk_wallets__user.
  pgm.sql(`CREATE INDEX ix_wallets__user_id ON wallets (user_id)`);
  // Only user-visible fields bump updated_at, so balance maintenance does not.
  pgm.sql(`
    CREATE TRIGGER tg_wallets__updated_at
      BEFORE UPDATE OF name, type, currency, opening_balance_minor, archived_at ON wallets
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`SET LOCAL lock_timeout = '5s'`);
  // DESTRUCTIVE in a populated database: wallet rows are not restored (database design notes 11.6).
  pgm.sql(`DROP TABLE IF EXISTS wallets`);
}

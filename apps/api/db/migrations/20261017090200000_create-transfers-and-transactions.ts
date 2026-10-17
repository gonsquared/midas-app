import type { MigrationBuilder } from 'node-pg-migrate';

// database design notes 5, 7.7, 7.8, 8, 9 (C-01, C-02, C-09) and 11.2 (#5). Story E5-F1-S1.
// Additive: new tables, functions and triggers. `recurring_template_id` and its constraint and
// index are added later by the create-recurring migration (E8-F1-S1), as planned in 11.2.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`SET LOCAL lock_timeout = '5s'`);

  // Keeps wallets.ledger_balance_minor equal to the sum of signed amounts (C-02, DB-ADR-05).
  // The only writer of ledger_balance_minor. Never disable it during bulk work. An update that
  // stays in the same wallet applies one NEW - OLD difference, and skips the wallet write when the
  // signed amount did not change (for example a transfer edit that only changes the date or note).
  pgm.sql(`
    CREATE FUNCTION apply_wallet_balance() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP = 'UPDATE' AND OLD.wallet_id = NEW.wallet_id THEN
        IF OLD.signed_amount_minor <> NEW.signed_amount_minor THEN
          UPDATE wallets
             SET ledger_balance_minor = ledger_balance_minor + (NEW.signed_amount_minor - OLD.signed_amount_minor)
           WHERE id = NEW.wallet_id;
        END IF;
        RETURN NULL;
      END IF;
      IF TG_OP IN ('UPDATE', 'DELETE') THEN
        UPDATE wallets SET ledger_balance_minor = ledger_balance_minor - OLD.signed_amount_minor
         WHERE id = OLD.wallet_id;
      END IF;
      IF TG_OP IN ('INSERT', 'UPDATE') THEN
        UPDATE wallets SET ledger_balance_minor = ledger_balance_minor + NEW.signed_amount_minor
         WHERE id = NEW.wallet_id;
      END IF;
      RETURN NULL;
    END $$
  `);

  // At commit, each transfer has exactly an out leg and an in leg that agree (C-01), or has no
  // header and no legs. On UPDATE both the old and the new transfer are checked, so moving a leg
  // out of a transfer (for example turning it into an expense) cannot leave an orphaned leg.
  // The header row is locked (FOR NO KEY UPDATE) before the legs are read, so two transactions
  // that each change one leg of the same transfer check one after the other: the second check
  // runs after the first commits and sees both changes (READ COMMITTED takes a new snapshot per
  // statement). Without the lock both checks could pass and commit an invalid pair.
  pgm.sql(`
    CREATE FUNCTION assert_transfer_pair() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE
      tids uuid[];
      tid  uuid;
    BEGIN
      IF TG_TABLE_NAME = 'transfers' THEN
        tids := ARRAY[NEW.id];
      ELSIF TG_OP = 'INSERT' THEN
        tids := ARRAY[NEW.transfer_id];
      ELSIF TG_OP = 'DELETE' THEN
        tids := ARRAY[OLD.transfer_id];
      ELSIF OLD.transfer_id IS NOT DISTINCT FROM NEW.transfer_id THEN
        tids := ARRAY[NEW.transfer_id];
      ELSE
        tids := ARRAY[OLD.transfer_id, NEW.transfer_id];
      END IF;

      FOREACH tid IN ARRAY tids LOOP
        CONTINUE WHEN tid IS NULL;
        PERFORM 1 FROM transfers WHERE id = tid FOR NO KEY UPDATE;
        IF NOT FOUND THEN
          IF EXISTS (SELECT 1 FROM transactions WHERE transfer_id = tid) THEN
            RAISE EXCEPTION 'transfer % has legs but no header', tid
              USING ERRCODE = 'check_violation', CONSTRAINT = 'ck_transfers__pair';
          END IF;
          CONTINUE;
        END IF;
        PERFORM 1
           FROM transactions o
           JOIN transactions i ON i.transfer_id = o.transfer_id AND i.transfer_direction = 'in'
          WHERE o.transfer_id = tid AND o.transfer_direction = 'out'
            AND o.wallet_id <> i.wallet_id
            AND o.occurred_on = i.occurred_on
            AND o.note IS NOT DISTINCT FROM i.note
            AND (o.currency <> i.currency OR o.amount_minor = i.amount_minor);
        IF NOT FOUND THEN
          RAISE EXCEPTION 'transfer % is incomplete or inconsistent', tid
            USING ERRCODE = 'check_violation', CONSTRAINT = 'ck_transfers__pair';
        END IF;
      END LOOP;
      RETURN NULL;
    END $$
  `);

  pgm.sql(`
    CREATE TABLE transfers (
      id         uuid           NOT NULL DEFAULT gen_random_uuid(),
      user_id    uuid           NOT NULL,
      created_at timestamptz(3) NOT NULL DEFAULT now(),
      updated_at timestamptz(3) NOT NULL DEFAULT now(),
      CONSTRAINT pk_transfers PRIMARY KEY (id),
      CONSTRAINT fk_transfers__user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
      CONSTRAINT uq_transfers__id_user UNIQUE (id, user_id)
    )
  `);
  // FK support for fk_transfers__user (user deletion); uq_transfers__id_user leads with id.
  pgm.sql(`CREATE INDEX ix_transfers__user_id ON transfers (user_id)`);
  pgm.sql(`
    CREATE TRIGGER tg_transfers__updated_at BEFORE UPDATE ON transfers
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);
  pgm.sql(`
    CREATE CONSTRAINT TRIGGER ct_transfers__pair AFTER INSERT ON transfers
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_transfer_pair()
  `);

  pgm.sql(`
    CREATE TABLE transactions (
      id                  uuid           NOT NULL DEFAULT gen_random_uuid(),
      user_id             uuid           NOT NULL,
      wallet_id           uuid           NOT NULL,
      type                text           NOT NULL,
      category_id         uuid           NULL,
      amount_minor        bigint         NOT NULL,
      signed_amount_minor bigint         GENERATED ALWAYS AS (
                            CASE WHEN type = 'income' OR transfer_direction = 'in'
                                 THEN amount_minor ELSE -amount_minor END) STORED,
      currency            text           NOT NULL,
      occurred_on         date           NOT NULL,
      note                text           NULL,
      transfer_id         uuid           NULL,
      transfer_direction  text           NULL,
      created_at          timestamptz(3) NOT NULL DEFAULT now(),
      updated_at          timestamptz(3) NOT NULL DEFAULT now(),
      CONSTRAINT pk_transactions PRIMARY KEY (id),
      CONSTRAINT fk_transactions__user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
      CONSTRAINT fk_transactions__wallet FOREIGN KEY (wallet_id, user_id, currency)
        REFERENCES wallets (id, user_id, currency) ON DELETE RESTRICT ON UPDATE RESTRICT,
      CONSTRAINT fk_transactions__category FOREIGN KEY (category_id, type)
        REFERENCES categories (id, type) ON DELETE RESTRICT ON UPDATE RESTRICT,
      CONSTRAINT fk_transactions__transfer FOREIGN KEY (transfer_id, user_id)
        REFERENCES transfers (id, user_id) ON DELETE CASCADE,
      CONSTRAINT ck_transactions__type CHECK (type IN ('income', 'expense', 'transfer')),
      CONSTRAINT ck_transactions__amount_range CHECK (amount_minor BETWEEN 1 AND 100000000000000),
      CONSTRAINT ck_transactions__currency CHECK (currency ~ '^[A-Z]{3}$'),
      CONSTRAINT ck_transactions__occurred_on_range CHECK (occurred_on BETWEEN DATE '1900-01-01' AND DATE '2100-12-31'),
      CONSTRAINT ck_transactions__note CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 500),
      CONSTRAINT ck_transactions__transfer_direction CHECK (transfer_direction IN ('out', 'in')),
      CONSTRAINT ck_transactions__transfer_shape CHECK (
        (type = 'transfer') = (transfer_id IS NOT NULL)
        AND (transfer_id IS NULL) = (transfer_direction IS NULL)
        AND (type = 'transfer') = (category_id IS NULL))
    )
  `);

  // Indexes (database design notes 8.1 and 8.3). The table is new and empty, so building them
  // inside the migration transaction is fine. Later index changes on transactions must use a
  // separate CREATE INDEX CONCURRENTLY migration (11.4).
  // AP-07 list with date sorts, AP-09 aggregations via index-only scans, FK support for the user.
  pgm.sql(`
    CREATE INDEX ix_transactions__user_date ON transactions (user_id, occurred_on, created_at, id)
      INCLUDE (type, currency, category_id, amount_minor)
  `);
  // AP-07 amount sorts and amount-range filters.
  pgm.sql(`
    CREATE INDEX ix_transactions__user_amount ON transactions (user_id, amount_minor, created_at, id)
  `);
  // AP-07 wallet filter, AP-18 wallet-in-use probe, FK support for wallet delete and currency change.
  pgm.sql(`
    CREATE INDEX ix_transactions__wallet_date ON transactions (wallet_id, occurred_on, created_at, id)
  `);
  // AP-07 category filter, AP-12 in-use check and bulk reassign, FK support for category delete.
  pgm.sql(`
    CREATE INDEX ix_transactions__category_user_date
      ON transactions (category_id, user_id, occurred_on, created_at, id)
      WHERE category_id IS NOT NULL
  `);
  // Exactly one out leg and one in leg per transfer, FK support for the header cascade.
  pgm.sql(`
    CREATE UNIQUE INDEX uq_transactions__transfer_leg ON transactions (transfer_id, transfer_direction)
      WHERE transfer_id IS NOT NULL
  `);
  // AP-07 note substring search, scoped by user inside one GIN index (btree_gin covers uuid).
  pgm.sql(`
    CREATE INDEX ix_transactions__user_note_trgm ON transactions USING gin (user_id, note gin_trgm_ops)
      WHERE note IS NOT NULL
  `);
  // AP-15 created-within-30-days count. The table is append-mostly, so BRIN stays tiny.
  pgm.sql(`CREATE INDEX ix_transactions__created_at_brin ON transactions USING brin (created_at)`);

  pgm.sql(`
    CREATE TRIGGER tg_transactions__updated_at BEFORE UPDATE ON transactions
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);
  pgm.sql(`
    CREATE TRIGGER tg_transactions__category_accessible
      BEFORE INSERT OR UPDATE OF category_id, user_id ON transactions
      FOR EACH ROW EXECUTE FUNCTION assert_category_accessible()
  `);
  pgm.sql(`
    CREATE TRIGGER tg_transactions__wallet_balance
      AFTER INSERT OR DELETE OR UPDATE OF wallet_id, amount_minor, type, transfer_direction
      ON transactions
      FOR EACH ROW EXECUTE FUNCTION apply_wallet_balance()
  `);
  // The pair check only concerns transfer legs. One trigger per event so each can carry a WHEN
  // clause (INSERT cannot see OLD, DELETE cannot see NEW): rows outside transfers, such as a bulk
  // category reassignment, queue no deferred events at all.
  pgm.sql(`
    CREATE CONSTRAINT TRIGGER ct_transactions__transfer_pair_insert
      AFTER INSERT ON transactions
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
      WHEN (NEW.transfer_id IS NOT NULL)
      EXECUTE FUNCTION assert_transfer_pair()
  `);
  pgm.sql(`
    CREATE CONSTRAINT TRIGGER ct_transactions__transfer_pair_update
      AFTER UPDATE ON transactions
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
      WHEN (OLD.transfer_id IS NOT NULL OR NEW.transfer_id IS NOT NULL)
      EXECUTE FUNCTION assert_transfer_pair()
  `);
  pgm.sql(`
    CREATE CONSTRAINT TRIGGER ct_transactions__transfer_pair_delete
      AFTER DELETE ON transactions
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
      WHEN (OLD.transfer_id IS NOT NULL)
      EXECUTE FUNCTION assert_transfer_pair()
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`SET LOCAL lock_timeout = '5s'`);
  // DESTRUCTIVE in a populated database: ledger rows are not restored (database design notes
  // 11.6). Dropping the tables also drops their triggers and indexes. wallets survives this down,
  // and its ledger_balance_minor is only meaningful together with the ledger, so it is reset to 0
  // here: re-applying starts from an empty ledger, and the balance invariant (C-02) holds again.
  pgm.sql(`DROP TABLE IF EXISTS transactions`);
  pgm.sql(`DROP TABLE IF EXISTS transfers`);
  pgm.sql(`UPDATE wallets SET ledger_balance_minor = 0 WHERE ledger_balance_minor <> 0`);
  pgm.sql(`DROP FUNCTION IF EXISTS assert_transfer_pair()`);
  pgm.sql(`DROP FUNCTION IF EXISTS apply_wallet_balance()`);
}

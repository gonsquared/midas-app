import type { MigrationBuilder } from 'node-pg-migrate';

// database design notes 7.2 to 7.4 and 11.2 (#2).
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`SET LOCAL lock_timeout = '5s'`);

  pgm.sql(`
    CREATE TABLE users (
      id               uuid           NOT NULL DEFAULT gen_random_uuid(),
      email            text           NOT NULL,
      password_hash    text           NOT NULL,
      display_name     text           NOT NULL,
      role             text           NOT NULL DEFAULT 'user',
      status           text           NOT NULL DEFAULT 'active',
      suspended_at     timestamptz(3) NULL,
      suspended_reason text           NULL,
      currency         text           NOT NULL DEFAULT 'USD',
      locale           text           NOT NULL DEFAULT 'en-US',
      timezone         text           NOT NULL DEFAULT 'UTC',
      theme            text           NOT NULL DEFAULT 'system',
      last_login_at    timestamptz(3) NULL,
      created_at       timestamptz(3) NOT NULL DEFAULT now(),
      updated_at       timestamptz(3) NOT NULL DEFAULT now(),
      CONSTRAINT pk_users PRIMARY KEY (id),
      CONSTRAINT ck_users__email_normalized CHECK (email = lower(btrim(email)) AND char_length(email) BETWEEN 3 AND 254 AND position('@' IN email) > 1),
      CONSTRAINT ck_users__password_hash CHECK (password_hash LIKE '$argon2id$%'),
      CONSTRAINT ck_users__display_name CHECK (display_name = btrim(display_name) AND char_length(display_name) BETWEEN 1 AND 80),
      CONSTRAINT ck_users__role CHECK (role IN ('user', 'admin')),
      CONSTRAINT ck_users__status CHECK (status IN ('active', 'suspended')),
      CONSTRAINT ck_users__suspension CHECK (
        (status = 'suspended') = (suspended_at IS NOT NULL)
        AND (status = 'suspended' OR suspended_reason IS NULL)
        AND (suspended_reason IS NULL OR char_length(suspended_reason) BETWEEN 1 AND 500)),
      CONSTRAINT ck_users__currency CHECK (currency ~ '^[A-Z]{3}$'),
      CONSTRAINT ck_users__locale CHECK (char_length(locale) BETWEEN 2 AND 35),
      CONSTRAINT ck_users__timezone CHECK (char_length(timezone) BETWEEN 1 AND 64),
      CONSTRAINT ck_users__theme CHECK (theme IN ('light', 'dark', 'system'))
    )
  `);
  pgm.sql(`CREATE UNIQUE INDEX uq_users__email ON users (email)`);
  pgm.sql(`CREATE INDEX ix_users__created_at ON users (created_at, id)`);
  pgm.sql(`CREATE INDEX ix_users__last_login_at ON users (last_login_at DESC NULLS LAST, id)`);
  pgm.sql(
    `CREATE INDEX ix_users__active_admins ON users (id) WHERE role = 'admin' AND status = 'active'`,
  );
  pgm.sql(`CREATE INDEX ix_users__email_trgm ON users USING gin (email gin_trgm_ops)`);
  pgm.sql(
    `CREATE INDEX ix_users__display_name_trgm ON users USING gin (display_name gin_trgm_ops)`,
  );
  pgm.sql(`
    CREATE TRIGGER tg_users__updated_at BEFORE UPDATE ON users
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  pgm.sql(`
    CREATE TABLE sessions (
      id                          uuid           NOT NULL DEFAULT gen_random_uuid(),
      user_id                     uuid           NOT NULL,
      current_refresh_token_hash  bytea          NOT NULL,
      previous_refresh_token_hash bytea          NULL,
      rotated_at                  timestamptz(3) NULL,
      created_at                  timestamptz(3) NOT NULL DEFAULT now(),
      last_used_at                timestamptz(3) NOT NULL DEFAULT now(),
      expires_at                  timestamptz(3) NOT NULL,
      revoked_at                  timestamptz(3) NULL,
      revoked_reason              text           NULL,
      user_agent                  text           NULL,
      ip                          inet           NULL,
      CONSTRAINT pk_sessions PRIMARY KEY (id),
      CONSTRAINT fk_sessions__user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
      CONSTRAINT ck_sessions__hash_length CHECK (octet_length(current_refresh_token_hash) = 32
        AND (previous_refresh_token_hash IS NULL OR octet_length(previous_refresh_token_hash) = 32)),
      CONSTRAINT ck_sessions__rotation CHECK ((previous_refresh_token_hash IS NULL) = (rotated_at IS NULL)),
      CONSTRAINT ck_sessions__expiry CHECK (expires_at > created_at),
      CONSTRAINT ck_sessions__revocation CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL)),
      CONSTRAINT ck_sessions__revoked_reason CHECK (revoked_reason IN
        ('logout', 'password_changed', 'password_reset', 'suspended', 'reuse_detected')),
      CONSTRAINT ck_sessions__user_agent CHECK (user_agent IS NULL OR char_length(user_agent) <= 512)
    )
  `);
  pgm.sql(`CREATE UNIQUE INDEX uq_sessions__current_hash ON sessions (current_refresh_token_hash)`);
  pgm.sql(`
    CREATE UNIQUE INDEX uq_sessions__previous_hash ON sessions (previous_refresh_token_hash)
      WHERE previous_refresh_token_hash IS NOT NULL
  `);
  pgm.sql(`CREATE INDEX ix_sessions__user_active ON sessions (user_id) WHERE revoked_at IS NULL`);
  pgm.sql(`CREATE INDEX ix_sessions__expires_at ON sessions (expires_at)`);
  pgm.sql(
    `CREATE INDEX ix_sessions__revoked_at ON sessions (revoked_at) WHERE revoked_at IS NOT NULL`,
  );

  pgm.sql(`
    CREATE TABLE password_reset_tokens (
      id         uuid           NOT NULL DEFAULT gen_random_uuid(),
      user_id    uuid           NOT NULL,
      token_hash bytea          NOT NULL,
      expires_at timestamptz(3) NOT NULL,
      used_at    timestamptz(3) NULL,
      created_at timestamptz(3) NOT NULL DEFAULT now(),
      CONSTRAINT pk_password_reset_tokens PRIMARY KEY (id),
      CONSTRAINT fk_password_reset_tokens__user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
      CONSTRAINT ck_password_reset_tokens__hash_length CHECK (octet_length(token_hash) = 32),
      CONSTRAINT ck_password_reset_tokens__expiry CHECK (expires_at > created_at)
    )
  `);
  pgm.sql(
    `CREATE UNIQUE INDEX uq_password_reset_tokens__token_hash ON password_reset_tokens (token_hash)`,
  );
  pgm.sql(`
    CREATE UNIQUE INDEX uq_password_reset_tokens__user_outstanding
      ON password_reset_tokens (user_id) WHERE used_at IS NULL
  `);
  pgm.sql(
    `CREATE INDEX ix_password_reset_tokens__expires_at ON password_reset_tokens (expires_at)`,
  );
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`SET LOCAL lock_timeout = '5s'`);
  pgm.sql(`DROP TABLE IF EXISTS password_reset_tokens`);
  pgm.sql(`DROP TABLE IF EXISTS sessions`);
  pgm.sql(`DROP TABLE IF EXISTS users`);
}

import type { MigrationBuilder } from 'node-pg-migrate';

// database design notes 6.3, 7.11, 8 (AP-14), 9 (C-07, C-10), 10.5, 13.1 to 13.3 and 11.2 (#8).
// Story E9-F1-S1. Additive: a new table and function.
// The role and status fields of E9-F1-S1 (users.role, users.status, suspended_at,
// suspended_reason, ix_users__active_admins) already exist since migration 2 (create-auth-tables)
// and are verified by tests rather than changed here.
// audit_logs is append-only history: no foreign keys (targets are polymorphic and rows must
// outlive what they reference), no updated_at, and no update or delete path for the application.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`SET LOCAL lock_timeout = '5s'`);

  // action is validated against the shared AuditAction list by the service; the database checks
  // only the format, so a new action needs no migration. metadata never holds passwords, tokens,
  // amounts, notes or transaction details (ADR-018); the 4 KB cap stops accidental large payloads.
  pgm.sql(`
    CREATE TABLE audit_logs (
      id            uuid           NOT NULL DEFAULT gen_random_uuid(),
      occurred_at   timestamptz(3) NOT NULL DEFAULT now(),
      actor_user_id uuid           NULL,
      action        text           NOT NULL,
      target_type   text           NOT NULL,
      target_id     uuid           NULL,
      ip            inet           NULL,
      user_agent    text           NULL,
      request_id    text           NULL,
      metadata      jsonb          NOT NULL DEFAULT '{}'::jsonb,
      CONSTRAINT pk_audit_logs PRIMARY KEY (id),
      CONSTRAINT ck_audit_logs__action CHECK (action ~ '^[a-z]+\\.[a-z_]+$' AND char_length(action) <= 64),
      CONSTRAINT ck_audit_logs__target_type CHECK (target_type IN ('user', 'session', 'category', 'system')),
      CONSTRAINT ck_audit_logs__user_agent CHECK (user_agent IS NULL OR char_length(user_agent) <= 512),
      CONSTRAINT ck_audit_logs__request_id CHECK (request_id IS NULL OR request_id ~ '^[A-Za-z0-9-]{8,64}$'),
      CONSTRAINT ck_audit_logs__metadata CHECK (jsonb_typeof(metadata) = 'object' AND octet_length(metadata::text) <= 4096)
    )
  `);
  // AP-14: each filter has an index whose leading column matches it, followed by (occurred_at, id)
  // for the keyset order occurred_at DESC, id DESC (backward scans). The first also serves the
  // unfiltered list, date ranges and the retention purge (occurred_at < :cutoff).
  pgm.sql(`CREATE INDEX ix_audit_logs__occurred_at ON audit_logs (occurred_at, id)`);
  pgm.sql(`
    CREATE INDEX ix_audit_logs__actor_occurred_at ON audit_logs (actor_user_id, occurred_at, id)
      WHERE actor_user_id IS NOT NULL
  `);
  pgm.sql(`
    CREATE INDEX ix_audit_logs__target_occurred_at
      ON audit_logs (target_type, target_id, occurred_at, id)
  `);
  pgm.sql(`CREATE INDEX ix_audit_logs__action_occurred_at ON audit_logs (action, occurred_at, id)`);

  // C-10: updates are rejected for every role, deletes for everyone except members of
  // midas_maintenance (the retention purge, 10.5). TRUNCATE is not a row event; midas_app has no
  // TRUNCATE privilege, and owner-level truncation (test harness, 16.2) is intentionally allowed.
  // Superusers count as members of every role, so on a superuser connection deletes pass.
  pgm.sql(`
    CREATE FUNCTION forbid_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP = 'DELETE' AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'midas_maintenance') THEN
        IF pg_has_role(current_user, 'midas_maintenance', 'MEMBER') THEN
          RETURN OLD;
        END IF;
      END IF;
      RAISE EXCEPTION 'audit_logs is append-only'
        USING ERRCODE = 'insufficient_privilege';
    END $$
  `);
  pgm.sql(`
    CREATE TRIGGER tg_audit_logs__immutable BEFORE UPDATE OR DELETE ON audit_logs
      FOR EACH ROW EXECUTE FUNCTION forbid_audit_mutation()
  `);

  // Privileges (13.1, 13.2). Migration 1 default privileges gave midas_app SELECT, INSERT, UPDATE,
  // DELETE on the new table; take back everything but SELECT and INSERT. midas_maintenance gets
  // SELECT and DELETE for the purge. Roles are created outside migrations, so only if present.
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'midas_app') THEN
        REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM midas_app;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'midas_maintenance') THEN
        GRANT SELECT, DELETE ON audit_logs TO midas_maintenance;
      END IF;
    END $$
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`SET LOCAL lock_timeout = '5s'`);
  // DESTRUCTIVE in a populated database: the audit trail is not restored (database design notes
  // 11.6). Take a pg_dump -t audit_logs archive first outside development. Dropping the table
  // also drops its indexes, trigger and grants; the function goes last.
  pgm.sql(`DROP TABLE IF EXISTS audit_logs`);
  pgm.sql(`DROP FUNCTION IF EXISTS forbid_audit_mutation()`);
}

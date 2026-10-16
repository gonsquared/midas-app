import type { MigrationBuilder } from 'node-pg-migrate';

// database design notes 7.1, 11.2 (#1) and 13.2.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`SET LOCAL lock_timeout = '5s'`);
  pgm.sql(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
  pgm.sql(`CREATE EXTENSION IF NOT EXISTS btree_gin`);
  pgm.sql(`
    CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      NEW.updated_at := now();
      RETURN NEW;
    END $$
  `);
  // Roles are created outside migrations (db/roles/roles.template.sql). Grant only if present.
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'midas_app') THEN
        ALTER DEFAULT PRIVILEGES IN SCHEMA public
          GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO midas_app;
      END IF;
    END $$
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`SET LOCAL lock_timeout = '5s'`);
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'midas_app') THEN
        ALTER DEFAULT PRIVILEGES IN SCHEMA public
          REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM midas_app;
      END IF;
    END $$
  `);
  pgm.sql(`DROP FUNCTION IF EXISTS set_updated_at()`);
  pgm.sql(`DROP EXTENSION IF EXISTS btree_gin`);
  pgm.sql(`DROP EXTENSION IF EXISTS pg_trgm`);
}

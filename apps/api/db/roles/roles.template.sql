-- Operator template (database design notes 13.2). Run once per environment with psql, for example:
--   psql "$DATABASE_MIGRATION_URL" -v app_password="$MIDAS_APP_DB_PASSWORD" -f roles.template.sql
-- Roles are cluster-level objects and are never created by migrations.
CREATE ROLE midas_app LOGIN PASSWORD :'app_password';
CREATE ROLE midas_maintenance NOLOGIN;
GRANT CONNECT ON DATABASE midas TO midas_app;
GRANT USAGE ON SCHEMA public TO midas_app;
-- Table privileges come from migration 1 (ALTER DEFAULT PRIVILEGES). Migrations 7 and 8 grant
-- midas_maintenance SELECT, DELETE on recurring_runs and audit_logs, and migration 8 revokes
-- UPDATE, DELETE, TRUNCATE on audit_logs from midas_app. Run this file before migrating so those
-- grants apply; if the roles are created later, rerun the grants by hand (database design notes 13.2).

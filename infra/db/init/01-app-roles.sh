#!/bin/sh
# Local Compose only. Runs once, when the db volume is first initialized (docker-entrypoint-initdb.d).
# Creates the application role used at runtime (DATABASE_URL) and the maintenance group role.
# Migrations are not allowed to create roles (database design notes 13.2), so this runs before them.
set -eu

psql -v ON_ERROR_STOP=1 \
  -v app_password="$MIDAS_APP_DB_PASSWORD" \
  -v dbname="$POSTGRES_DB" \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'EOSQL'
CREATE ROLE midas_app LOGIN PASSWORD :'app_password';
CREATE ROLE midas_maintenance NOLOGIN;
GRANT CONNECT ON DATABASE :"dbname" TO midas_app;
GRANT USAGE ON SCHEMA public TO midas_app;
EOSQL

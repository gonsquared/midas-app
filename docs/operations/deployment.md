# Runbook: Deploy Midas

- **Owner:** backend maintainers
- **Last verified:** 2026-10-19, with the production image built from this repository
  (`docker build -f infra/docker/Dockerfile --target runtime`) against PostgreSQL 17 in Docker:
  migrate, seed, `admin:create`, start, `/health`, SPA, `pg_dump` and `pg_restore` into a new
  database. Not yet run on a hosted platform.
- **Severity / urgency:** routine for a release; urgent when rolling back

## When to use this

You are putting Midas on a server for the first time, releasing a new version, or rolling a
release back. Day-two triage (errors, slowness) is in [troubleshoot-api.md](./troubleshoot-api.md).

## What you deploy

One image, one process, one database (architecture ADR-014).

- The image is `infra/docker/Dockerfile`, target `runtime`. Build context is the repository root.
  CI builds it on every pull request and smoke-tests it (job "Production image"). Publishing to a
  registry is not set up yet: build and push it yourself, or build on the host.
- Contents: Node 24, compiled API (`/app/dist/server.js`, `/app/dist/cli.js`, migrations in
  `/app/dist/db/migrations`), production `node_modules` only, and the built web app (`/app/web`,
  `WEB_DIST_DIR`). It has no `.env` file, no secrets, no `tsx` and no dev dependencies.
- It runs as the unprivileged `node` user, listens on `PORT` (3000), and has a Docker
  `HEALTHCHECK` on `GET /health`. `SIGTERM` drains requests, stops the scheduler and closes the
  database pool.
- The API serves the web app from the same origin: `/assets/*` (content-hashed, cached for a year,
  `immutable`), `index.html` (`no-cache`), and `index.html` again for browser navigations to client
  routes. Unknown `/api/*`, `/health` and `/metrics` paths are never answered with the web app.
  There is no CORS in production and nothing else to host.
- Needed around it: PostgreSQL 17 with automated backups, an SMTP server (password-reset mail),
  and a TLS-terminating reverse proxy or platform router in front.

## Before you start

- The image tag you are deploying, and the tag currently running (needed to roll back).
- A database and its two roles: an owner that runs migrations (`DATABASE_MIGRATION_URL`) and the
  limited `midas_app` role the server uses (`DATABASE_URL`). Roles are created outside migrations:
  edit and run [`apps/api/db/roles/roles.template.sql`](../../apps/api/db/roles/roles.template.sql)
  once per environment, before the first migration. Managed databases: use a direct connection
  for migrations, not a transaction pooler (advisory locks).
- The secrets below in your platform's secret store. Never put them in the image or in git.
- For a release that contains a destructive migration: a fresh backup (see
  [Backups](#backups-and-restore)).

## Configuration

The full variable list, defaults and validation rules are the table in the README,
["Environment variables"](../../README.md#environment-variables); `.env.example` has a template. The server
validates everything at boot and exits with the variable names (never values) if something is
wrong. Production adds these checks, so a misconfigured deployment fails to start instead of
running unsafe.

Required in production:

| Variable | Notes |
| --- | --- |
| `NODE_ENV` | The image sets `production`. Do not override it. |
| `DATABASE_URL` | `postgres://midas_app:...@host:5432/midas`. A secret. |
| `DATABASE_MIGRATION_URL` | Owner role, used by the migrate command only. A secret. Falls back to `DATABASE_URL`, which lacks the rights to migrate. |
| `JWT_ACCESS_SECRET` | At least 43 characters, for example `openssl rand -base64 48`. A secret. Changing it signs everyone out of their current access token (sessions recover through the refresh cookie). |
| `APP_BASE_URL` | Public `https://` origin of the app, used in password-reset links. |
| `MAIL_TRANSPORT=smtp` with `SMTP_HOST`, `SMTP_PORT`, `MAIL_FROM` | `SMTP_USER` and `SMTP_PASSWORD` are secrets. Use `SMTP_SECURE=true` (port 465) or STARTTLS. |
| `DATABASE_SSL` | Defaults to `verify-full` in production (`off` is rejected). Provide `DATABASE_SSL_CA` if the provider uses a private CA. `require` encrypts without verifying the certificate and logs a warning. |

Strongly recommended:

| Variable | Notes |
| --- | --- |
| `AUDIT_HMAC_SECRET` | At least 32 characters. A secret. Without it a boot warning says failed sign-ins for unknown emails are audited without a pseudonym. |
| `METRICS_TOKEN` | At least 32 characters. A secret. `/metrics` answers 404 until it is set. Keep `/metrics` off the public internet at the proxy as well. |
| `TRUST_PROXY` | Number of reverse proxies in front of the app. See [Reverse proxy](#reverse-proxy-https-and-hsts). |
| `APP_VERSION` | Shown by `/health`; set it to the release tag. |
| `LOG_LEVEL` | `info` by default. Logs are JSON on stdout; collect them from the platform. |

Notes on others:

- `RATE_LIMIT_ENABLED=false` is rejected in production. The other `RATE_LIMIT_*` values are tunable.
- `CORS_ORIGINS` is ignored in production (a boot warning says so).
- `SCHEDULER_ENABLED` and its siblings: see [Scheduler](#scheduler).
- `WEB_DIST_DIR` defaults to `/app/web` in the image. Relative paths resolve from the working
  directory. If the folder has no `index.html` the API starts and serves the API only.
- `BOOTSTRAP_ADMIN_EMAIL`: see [First administrator](#first-administrator).

## Steps: first deployment

1. Build and publish the image.

   ```bash
   docker build -f infra/docker/Dockerfile --target runtime -t registry.example.com/midas:1.0.0 .
   docker push registry.example.com/midas:1.0.0
   ```

2. Create the database and run `roles.template.sql` (see Before you start).

3. Run the migrations and the system category seed with the new image, as a one-off job, before
   it takes traffic. Use the owner credentials and the same TLS settings as the app.

   ```bash
   docker run --rm \
     -e DATABASE_MIGRATION_URL -e DATABASE_SSL -e DATABASE_SSL_CA \
     registry.example.com/midas:1.0.0 \
     sh -c 'node dist/cli.js migrate && node dist/cli.js seed:system'
   ```

   Expected result: a `### MIGRATION ... (UP) ###` line per pending migration, `Applied N.`,
   and `seed:system: 29 inserted, ...` (zero inserted on later runs). Pass `-e NAME` only for variables
   that are set in your shell; on a platform use its release or pre-deploy command with the same
   command line.

   Other commands, all through `node dist/cli.js`: `migrate:status` lists applied and pending
   migrations, `migrate:down [--count N] --confirm-production` reverts the last N (see
   [Roll back](#roll-back)).

4. Start the container with the application variables. Example with a plain Docker host:

   ```bash
   docker run -d --name midas --restart unless-stopped -p 127.0.0.1:3000:3000 \
     --env-file /etc/midas/midas.env \
     registry.example.com/midas:1.0.0
   ```

   `/etc/midas/midas.env` holds `KEY=value` lines, is readable by root only, and is created on the
   host, never in git.

5. Put the reverse proxy in front (next section), then create the first administrator.

## Steps: release a new version

1. Merge to the release branch and let CI pass, including the "Production image" job (image
   builds, smoke test, Playwright under the real CSP) and `migrate:verify`.
2. Build and push the image with a new tag. Never reuse a tag.
3. If the release has a destructive migration (the file starts with `-- DESTRUCTIVE:`), take a
   backup first.
4. Run the migrate and seed job with the new image (step 3 above). Migrations are written so the
   previous version keeps working against the new schema (expand, then contract; database design
   11.3), so the old containers can keep serving during this step.
5. Start the new containers, wait for `/health`, then retire the old ones. With one instance expect
   a few seconds of unavailability; the healthcheck gives a platform what it needs for a rolling
   deploy.
6. [Verify](#verify).

## Migrations on a database that already holds data

`migrate` runs each migration in its own transaction with `lock_timeout = 5s`, and fails fast
(instead of waiting) if another migration runner holds the advisory lock. A migration that cannot
get its lock in 5 seconds fails and rolls back whole, which is safe to retry.

Carry-forward caution: **migration 7** (`create-recurring`) takes locks inside its transaction
that are fine on a new or small database and are not on a large, busy one. It adds a column, a
foreign key and a check constraint to `transactions`, then builds an index on it. The constraint
additions validate every existing row while holding a lock that blocks writes to the table, and the
index build blocks writes until it finishes. Already-deployed databases have this migration
applied, so this affects only a database migrated for the first time with data in `transactions`.
Before running it against such a database:

- Run it in a quiet window, or
- Hand-edit a copy of the migration for that one run: `ADD CONSTRAINT ... NOT VALID` for the
  foreign key and the check, then `VALIDATE CONSTRAINT` in a following statement outside the
  exclusive lock, and `CREATE INDEX CONCURRENTLY` in a separate `noTransaction` migration. This
  is the playbook in [database design 11.4](../database.md#114-playbooks-for-adding-changing-and-removing-schema).
  Involve whoever owns the schema before deviating from the committed migration.

Every future migration that touches a populated table must follow 11.4 from the start (`NOT VALID`
then `VALIDATE`, `CREATE INDEX CONCURRENTLY`, backfills in batches outside migrations).

## First administrator

Nobody becomes admin by registering. After the first deployment, with the same image. It connects
through the owner role, so it needs `DATABASE_MIGRATION_URL` (or `DATABASE_URL`) and the TLS
settings, and nothing else:

```bash
docker run --rm -it --env-file /etc/midas/midas.env registry.example.com/midas:1.0.0 \
  node dist/cli.js admin:create --email you@example.com --display-name "Your Name"
```

It prompts for a password (hidden). For scripts use `--password-stdin`. The command creates a NEW
account and fails if the email exists; `admin:promote --email <email>` promotes an existing account
and writes an audit row. On hosts with no shell access, set `BOOTSTRAP_ADMIN_EMAIL` for one boot:
while no admin exists it creates that account with an unusable password and you set a real one with
"Forgot password" (needs working SMTP). Remove the variable afterwards. Details: README, "First
admin".

## Reverse proxy, HTTPS and HSTS

- Terminate TLS in front of the container (a platform router, Caddy, nginx, a load balancer) and
  forward to port 3000. Redirect HTTP to HTTPS there. The refresh-token cookie is `Secure`, so the
  app does not work over plain HTTP outside localhost.
- `APP_BASE_URL` must be the public `https://` origin. The refresh endpoint checks the request
  `Origin` against it, so a proxy must pass `Origin` and `Host` through unchanged.
- The app sends `Strict-Transport-Security: max-age=15552000; includeSubDomains` in production
  (180 days). Only preload or lengthen it at the proxy once every subdomain is HTTPS.
- Security headers and the Content-Security-Policy come from the app. Do not add a second CSP at
  the proxy; if you add one it must be at least as strict, or pages break.
- **`TRUST_PROXY`** is the number of proxy hops whose `X-Forwarded-For` the app believes. It
  decides the client IP used by the per-IP rate limits and audit rows. With `0` (default) the
  app uses the socket address, which behind a proxy is the proxy itself, so every user shares
  one rate-limit bucket. Set it to exactly the number of proxies in front (usually `1`). Never set
  it higher than the real count, and make sure the proxy overwrites an incoming
  `X-Forwarded-For` rather than appending to it; otherwise clients can spoof their IP and dodge
  limits.
- Do not expose `/metrics` publicly. It is token protected, and the proxy should still restrict
  it to your monitoring network.

## Scheduler

The recurring-transaction scheduler runs inside the server process (`SCHEDULER_ENABLED=true` by
default). Work is claimed through the database, so several instances can all keep it enabled
safely: a pass on one instance does not duplicate another's. If you prefer one place to run it,
disable it on web instances (`SCHEDULER_ENABLED=false`) and run a single extra container from the
same image with the scheduler on, or call `node dist/cli.js jobs:run recurring` from cron. If you
disable it everywhere, no recurring transactions are generated. A stuck or failing scheduler shows
in the `/metrics` scheduler counters and the logs (see [troubleshoot-api.md](./troubleshoot-api.md)).

## Rate limits are per instance

Rate-limit counters live in each process's memory (an LRU per limiter, `RATE_LIMIT_STORE_MAX_KEYS`
entries). With N instances the effective limit is up to N times the configured one, and a restart
resets the counters. Run a single instance, or accept the multiplication, until a shared store is
added. This also weakens the login brute-force limits, so keep the proxy-level limits sensible and
the password policy enforced. Sessions, refresh tokens and audit data are in the database and
are shared by all instances.

## Verify

```bash
curl -s https://midas.example.com/health
# {"status":"ok","version":"1.0.0","uptimeSeconds":12,"checks":{"database":"up"}}
curl -sI -H 'Accept: text/html' https://midas.example.com/ | grep -i -e '^HTTP' -e content-security -e strict-transport -e cache-control
curl -s -o /dev/null -w '%{http_code}\n' https://midas.example.com/api/v1/wallets   # 401
```

- `/health` is 200 with `database: up`. A 503 means the database check failed.
- `/` returns 200 `text/html` with a `Content-Security-Policy`, `Strict-Transport-Security` and
  `Cache-Control: no-cache`.
- An unknown API path returns 404 `application/problem+json`, not HTML.
- `docker inspect -f '{{.State.Health.Status}}' midas` is `healthy`.
- Register a test account in the browser, sign in, create a wallet, request a password reset and
  confirm the mail arrives.

## Roll back

The default is to roll forward with a fix. Roll back the application when the new version
misbehaves and the database is fine:

1. Redeploy the previous image tag (the one you wrote down before starting). Do not rebuild it.
2. Do **not** revert migrations. The compatibility rule means the previous version runs against the
   newer schema. The migrate job for the next attempt is a no-op for migrations already applied.
3. [Verify](#verify).

Reverting a migration (`node dist/cli.js migrate:down --confirm-production`, one at a time with
`--count 1`) is an emergency measure for a migration that itself broke the schema. It runs the
migration's `down()`, which for contract migrations restores structure but **not data**. Take a
backup first. If the data itself is wrong or lost, restore a backup into a new database (next
section) instead of reverting.

The point of no return: after a contract migration (a column or table dropped) the previous
version may no longer work, and only a restore recovers the dropped data. Such migrations carry a
`-- DESTRUCTIVE:` header and need the pre-migration backup.

## Backups and restore

Targets (database design 14): provider point-in-time recovery where available, plus a daily
encrypted logical dump kept outside the database host, with periodic restore tests. A backup that
has not been restored is a guess.

Logical backup (works on any host; custom format, compressed):

```bash
pg_dump --format=custom --no-owner --dbname "$DATABASE_MIGRATION_URL" --file "midas-$(date +%F).dump"
```

Run it with the owner credentials. Encrypt the file before it leaves the host and keep it in
storage the database host cannot overwrite. The dump contains personal financial data and password
hashes: protect it like the database itself.

Restore **into a new database, never over the live one**:

```bash
createdb --maintenance-db "$ADMIN_DATABASE_URL" midas_restore
pg_restore --no-owner --dbname "postgres://owner:...@host:5432/midas_restore" midas-2026-10-19.dump
```

Then check the restore before using it:

```bash
psql "postgres://owner:...@host:5432/midas_restore" -c 'select count(*) from users' -c 'select name from schema_migrations order by id desc limit 1'
```

The latest migration name must match what the dump's release expects. Re-run the role template
grants if the roles did not exist yet (see `roles.template.sql`), start a copy of the app with
`DATABASE_URL` pointing at the restored database, check `/health`, and only then switch traffic (or
repoint the production `DATABASE_URL`). Restoring changes the data back in time: users lose
changes made after the backup, and sessions created after it stop working. Tell them.

With Docker Compose-style hosts you can run the same tools through the database container:

```bash
docker compose exec -T db pg_dump -U midas_owner -Fc midas > midas.dump
docker compose exec -T db pg_restore -U midas_owner -d midas_restore --no-owner < midas.dump
```

Database design 14.4 plans a `db:check` integrity command; it does not exist yet. Until it does,
the row-count and migration checks above are the minimum.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Container exits at once, log shows `Invalid configuration:` | A required variable is missing or unsafe for production | Read the variable names in the message and fix them. Values are never printed. |
| `The server does not support SSL connections` | `DATABASE_SSL` defaults to `verify-full` in production and the database has no TLS | Enable TLS on the database. `off` is rejected in production by design. |
| `self-signed certificate` / certificate errors | Provider uses a private CA | Set `DATABASE_SSL_CA` to the CA certificate (PEM). |
| `migrate` fails at once about the migration lock | Another migration runner is active (a parallel deploy job) | Wait for it to finish, then re-run. The lock is released when its connection closes. |
| `lock timeout` during `migrate` | A long transaction holds a lock on a table the migration alters | Retry in a quiet window; see "Migrations on a database that already holds data". |
| `/` returns the JSON 404 instead of the app | The web build is missing from the image, or `WEB_DIST_DIR` is wrong | The boot log says `no web build found`. Rebuild with the Dockerfile and check `/app/web/index.html`. |
| Every user is rate limited together | `TRUST_PROXY` is `0` behind a proxy | Set it to the number of proxies. |
| Client IPs in logs are wrong or spoofable | `TRUST_PROXY` too high, or the proxy appends instead of overwrites `X-Forwarded-For` | Match the real hop count; configure the proxy. |
| Sign-in works but refresh fails right after | `APP_BASE_URL` does not equal the browser's origin, or the proxy strips `Origin` | Fix `APP_BASE_URL` (scheme, host, port) and the proxy headers. |
| Reset mail never arrives | SMTP settings, or `MAIL_FROM` rejected by the provider | `mail` log lines and [troubleshoot-api.md](./troubleshoot-api.md). |

## Escalate

Attach the output of `/health`, the first 100 log lines after boot, the image tag, and the last
migration name (`select name from schema_migrations order by id desc limit 1`) to the issue.
Never paste secrets or connection strings.

## After

- Record the release tag, migration state and who deployed in your change log.
- Rotate any secret that was pasted somewhere it should not have been.
- Remove `BOOTSTRAP_ADMIN_EMAIL` once the admin account exists.

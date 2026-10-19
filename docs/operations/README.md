# Operations

Runbooks for running Midas. Each runbook is one file that a person on call can follow without
asking anyone, starting from [runbook-template.md](./runbook-template.md).

| Runbook | When to use it |
| --- | --- |
| [deployment.md](./deployment.md) | Deploy, release, roll back, back up and restore: image, environment, migrations, first admin, proxy and HTTPS, scheduler |
| [troubleshoot-api.md](./troubleshoot-api.md) | Triage of API failures: health, logs and request ids, metrics, rate limits, CORS/CSP, mail, audit, scheduler |
| [release-checklist.md](./release-checklist.md) | Cut the v1.0 release: open gates, secrets, database, tag, post-deploy checks |

Restore is covered inside the deployment runbook (backups and restore).

## Writing a runbook

1. Copy `runbook-template.md` to `<verb>-<thing>.md`, for example `restore-database.md`.
2. Write for someone who is tired and has never done this. Exact commands, expected output.
3. Run every command yourself before merging. A runbook that was not tried is a guess.
4. Add it to the table above.

## Local stack quick reference

Local development uses `docker compose up --build`. See the "Docker (local stack)" section of
[CONTRIBUTING.md](../../CONTRIBUTING.md) for ports, hot reload and how to reset the database.

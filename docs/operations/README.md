# Operations

Runbooks for running Midas. Each runbook is one file that a person on call can follow without
asking anyone, starting from [runbook-template.md](./runbook-template.md).

| Runbook | When to use it |
| --- | --- |
| _None yet._ Deployment and incident runbooks are written with the release stories. | |

## Writing a runbook

1. Copy `runbook-template.md` to `<verb>-<thing>.md`, for example `restore-database.md`.
2. Write for someone who is tired and has never done this. Exact commands, expected output.
3. Run every command yourself before merging. A runbook that was not tried is a guess.
4. Add it to the table above.

## Local stack quick reference

Local development uses `docker compose up --build`. See the "Docker (local stack)" section of
[CONTRIBUTING.md](../../CONTRIBUTING.md) for ports, hot reload and how to reset the database.

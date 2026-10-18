# Midas documentation

Everything a contributor or operator needs, in one place. Start with the root
[README](../README.md) for what Midas is and how to run it.

| I want to... | Go to |
| --- | --- |
| Run the app locally (Docker Compose, hot reload, reset the database) | [README: Run with Docker Compose](../README.md#run-with-docker-compose) and [CONTRIBUTING: Docker](../CONTRIBUTING.md#docker-local-stack) |
| Contribute code, run lint and tests, follow the PR process | [CONTRIBUTING.md](../CONTRIBUTING.md) |
| Understand what Midas is for and what it must do | [Project brief](./project-brief.md) and [Specifications](./SPECS.md) (goals, personas, requirements, glossary) |
| Understand the architecture, stack, security approach, testing strategy and risks | [Architecture](./architecture.md) |
| Read the full API contract (conventions, models, every endpoint) | [API contract](./api-contract.md). The [OpenAPI draft](../apps/api/openapi/openapi.yaml) tracks what is implemented; the contract is the design authority |
| Understand the database design in depth (schema, indexes, consistency, backup) | [Database design](./database.md) |
| Build or review UI (design system, flows, layouts, accessibility, microcopy) | [UI design](./ui-design.md) |
| Understand why the system is built this way | [Architecture decision records](./adr/README.md) (18 decisions: stack, auth, money, scheduling, deployment) |
| Call or extend the API | [OpenAPI 3.1 draft](../apps/api/openapi/openapi.yaml), with each operation tagged implemented or planned |
| Understand the database, migrations and seeds | [apps/api/db/README.md](../apps/api/db/README.md) |
| Operate or recover a deployment | [Operations runbooks](./operations/README.md) and the [runbook template](./operations/runbook-template.md) |
| Report a security issue | [SECURITY.md](../SECURITY.md) |
| Record a new architecture decision | [ADR template](./adr/template.md) |

## Conventions

- Dates use `YYYY-MM-DD`.
- Decisions are never edited after acceptance: add an amendment or supersede them (see the ADR README).
- Runbooks are written from commands that were actually run.
- No secrets, personal data or internal references appear in any document.

## Not yet written

A user guide and deployment runbooks arrive with the release stories. This page will link to them
when they exist.

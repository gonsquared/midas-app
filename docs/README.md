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
| Call or extend the API (auth model, conventions, errors, pagination, rate limits) | [API reference](./api/README.md), then the [OpenAPI 3.1 description](../apps/api/openapi/openapi.yaml), with each operation tagged implemented or planned |
| Learn how to use the app (accounts, wallets, transactions, budgets, recurring, reports, admin) | [User guide](./user-guide.md) |
| See the Sprint 4 review outcomes (findings, status, authorization table) | [Backend security review](./reviews/sprint-4-backend-security-review.md) and [frontend review](./reviews/sprint-4-frontend-review.md) |
| Understand the database, migrations and seeds | [apps/api/db/README.md](../apps/api/db/README.md) |
| Deploy, release, roll back, back up and restore | [Deployment guide](./operations/deployment.md) |
| Operate or recover a deployment | [Operations runbooks](./operations/README.md) and the [runbook template](./operations/runbook-template.md) |
| Report a security issue | [SECURITY.md](../SECURITY.md) |
| Record a new architecture decision | [ADR template](./adr/template.md) |

## Conventions

- Dates use `YYYY-MM-DD`.
- Decisions are never edited after acceptance: add an amendment or supersede them (see the ADR README).
- Runbooks are written from commands that were actually run.
- No secrets, personal data or internal references appear in any document.

## Reviews

Review outcomes live in `docs/reviews/`: [backend code and security review](./reviews/sprint-4-backend-security-review.md) (2026-10-19) and [frontend code review](./reviews/sprint-4-frontend-review.md) (2026-10-19).

## Not yet written

Screenshots are in `docs/images/` (sample data from the fake API, not a real account). The OpenAPI file is committed and
checked by tests; it is not yet served by the running API or published as a hosted site.

# Architecture decision records

One file per decision. These files are the versioned, individually linkable record; each
notes the planning-document section it was first written in. Add new decisions
here, starting from [template.md](./template.md), and number them in order.

| ADR | Decision | Status |
| --- | --- | --- |
| [001](./001-modular-monolith.md) | Modular monolith, single deployable | Accepted |
| [002](./002-backend-typescript-fastify.md) | Backend in TypeScript on Node.js 24 LTS with Fastify 5 | Accepted |
| [003](./003-frontend-react-vite.md) | Frontend in React 19 with Vite, TanStack Router and TanStack Query | Accepted |
| [004](./004-client-side-rendering.md) | Rendering is client-side only, served from the API origin | Accepted |
| [005](./005-pnpm-workspaces-monorepo.md) | pnpm workspaces monorepo on the Node runtime | Accepted |
| [006](./006-rest-openapi-problem-details.md) | REST, a code-first OpenAPI spec, Problem Details and two pagination styles | Accepted |
| [007](./007-auth-tokens-and-argon2id.md) | Short-lived JWT access token in memory, rotating refresh token in an httpOnly cookie, argon2id | Accepted |
| [008](./008-multi-currency-policy.md) | Multi-currency policy | Accepted |
| [009](./009-integer-minor-units.md) | Integer minor units | Accepted |
| [010](./010-email-provider-abstraction.md) | Email provider abstraction | Accepted |
| [011](./011-in-process-recurring-scheduler.md) | Recurring scheduler runs in process and is coordinated through the database | Accepted |
| [012](./012-budget-calendar-periods.md) | Budgets use calendar periods, monthly by default, with an 80% warning threshold | Accepted |
| [013](./013-first-admin-bootstrap.md) | First admin via CLI, with a one-time bootstrap setting as fallback | Accepted |
| [014](./014-single-docker-image-deployment.md) | Single Docker image on a container host, with a Render Blueprint as the one-click reference | Accepted |
| [015](./015-testing-toolset.md) | Testing toolset | Accepted |
| [016](./016-database-engine.md) | Database engine | Accepted |
| [017](./017-date-only-ledger-timezone.md) | Date-only ledger with a timezone per user | Accepted |
| [018](./018-admin-privacy-boundary.md) | Admin privacy boundary | Accepted |

## Process

1. Copy `template.md` to `NNN-short-title.md` with the next free number.
2. Fill in context, decision, alternatives rejected and consequences. Keep it to one page.
3. Open a pull request. Status moves from Proposed to Accepted when the PR merges.
4. Never rewrite an accepted decision. Add an amendment section, or write a new ADR that supersedes
   it and set the old one to `Superseded by NNN`.

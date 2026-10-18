# 6. REST, a code-first OpenAPI spec, Problem Details and two pagination styles

- **Status:** Accepted
- **Date:** 2026-10-16
- **Source:** mirrored from `docs/architecture.md` section 14 (ADR-006)

- **Decision:** versioned REST (`/api/v1`); OpenAPI 3.1 intended to be generated from shared Zod schemas (until then a hand-maintained draft, see the amendment); RFC 9457 errors with stable codes; keyset cursors for high-volume lists and page numbers for the admin user table; 404 for foreign resources; strict schemas that reject unknown fields.
- **Alternatives rejected:** GraphQL (adds complexity for a fixed set of screens and makes rate limiting and authz harder to reason about); tRPC (couples clients to TypeScript, which is weaker for a public API reference); a hand-written OpenAPI spec (drift risk).
- **Consequences:** a single source of truth for types. `api-contract.md` stays the human authority, and contract tests catch drift.

## Amendment (2026-10-18)

The first OpenAPI draft is hand-maintained at `apps/api/openapi/openapi.yaml` because the routes are plain Fastify handlers with Zod validation, not yet registered through a Zod type provider. A test (`apps/api/src/openapi.test.ts`) fails when a registered route is missing from the spec or the spec lists an implemented operation that is not registered, which contains the drift risk named above. Generating the document from the shared Zod schemas remains the target and would supersede the hand-written file.

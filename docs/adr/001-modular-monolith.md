# 1. Modular monolith, single deployable

- **Status:** Accepted
- **Date:** 2026-10-16
- **Source:** mirrored from `docs/architecture.md` section 14 (ADR-001)

- **Context:** small team, moderate domain, one-click deployment wanted, strict money consistency.
- **Decision:** one Fastify app with domain modules and internal service boundaries; the SPA is served by the same process.
- **Alternatives rejected:** microservices (operational overhead, distributed transactions for transfers); separate frontend host (CORS and cookie complexity, two deploys).
- **Consequences:** simple operations and local ACID transactions. Module boundaries must be enforced by convention and lint rules (no cross-module repository imports). A module can be extracted later if ever needed.

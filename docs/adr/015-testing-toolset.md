# 15. Testing toolset

- **Status:** Accepted
- **Date:** 2026-10-16
- **Source:** mirrored from `docs/architecture.md` section 14 (ADR-015)

- **Decision:** Vitest everywhere, Testcontainers for integration tests, MSW and RTL for components, Playwright with axe for E2E and accessibility, autocannon for performance, and the coverage gates in §11.
- **Alternatives rejected:** Jest (slower; Vitest matches Vite); Cypress (Playwright has better multi-browser support and parallelism); mocking the database in integration tests (misses constraint and locking behavior that money correctness depends on).
- **Consequences:** CI needs Docker for integration and E2E jobs, which GitHub-hosted runners provide.

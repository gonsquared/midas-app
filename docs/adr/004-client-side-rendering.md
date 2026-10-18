# 4. Rendering is client-side only, served from the API origin

- **Status:** Accepted
- **Date:** 2026-10-16
- **Source:** mirrored from `docs/architecture.md` section 14 (ADR-004)

- **Decision:** CSR for all routes; the SPA is served by Fastify with `index.html` fallback and immutable hashed assets.
- **Alternatives rejected:** SSR, SSG, ISR, RSC and hybrid (see §5).
- **Consequences:** no CORS in production, `SameSite=Strict` cookies work, and there is one image. Public pages are not server-rendered, which is acceptable because SEO is not a goal.

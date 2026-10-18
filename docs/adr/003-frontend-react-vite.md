# 3. Frontend in React 19 with Vite, TanStack Router and TanStack Query

- **Status:** Accepted
- **Date:** 2026-10-16
- **Source:** mirrored from `docs/architecture.md` section 14 (ADR-003)

- **Context:** authenticated app with filter-heavy screens, an accessibility mandate, charts.
- **Decision:** React with Vite; TanStack Router for typed routes and search params; TanStack Query; React Hook Form with shared Zod schemas; Tailwind v4 tokens; Radix primitives; Recharts; lucide icons limited to an allowlist.
- **Alternatives rejected:** Next.js (server runtime and RSC with no SEO payoff); React Router framework mode (SSR unnecessary, weaker typed search params); Vue or Svelte (no justification to leave the default); Redux (server state is covered by Query).
- **Consequences:** a static build and fast development. Client-side code splitting is required to keep the initial bundle small (charts and zxcvbn lazy-loaded).

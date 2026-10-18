# 5. pnpm workspaces monorepo on the Node runtime

- **Status:** Accepted
- **Date:** 2026-10-16
- **Source:** mirrored from `docs/architecture.md` section 14 (ADR-005)

- **Decision:** pnpm 10.x via Corepack; workspaces `apps/*`, `packages/*`, `tooling/*`, `e2e`; commit `pnpm-lock.yaml`.
- **Alternatives rejected:** Bun as installer and runtime (runtime compatibility risk for native modules; marginal benefit given Vite and Vitest); npm (slower, weaker workspace isolation); Turborepo or Nx (unnecessary at three packages; can be added later).
- **Consequences:** strict dependency isolation and reproducible CI. Contributors run `corepack enable`.

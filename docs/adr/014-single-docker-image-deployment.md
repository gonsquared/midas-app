# 14. Single Docker image on a container host, with a Render Blueprint as the one-click reference

- **Status:** Accepted
- **Date:** 2026-10-16
- **Source:** mirrored from `docs/architecture.md` section 14 (ADR-014)

- **Decision:** a multi-stage image with the API and SPA; managed database; migrations as a release step; `render.yaml` blueprint plus Fly.io and VPS (Compose + Caddy) guides; images in GitHub Container Registry; GitHub Actions CI.
- **Alternatives rejected:** serverless functions (long-running scheduler and streaming CSV fit poorly, plus cold starts); Kubernetes (excessive for v1); separate static frontend hosting (CORS and cookie complexity).
- **Consequences:** portable and inexpensive. Scaling out requires the shared rate-limit store (R2).

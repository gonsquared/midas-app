# 2. Backend in TypeScript on Node.js 24 LTS with Fastify 5

- **Status:** Accepted
- **Date:** 2026-10-16
- **Source:** mirrored from `docs/architecture.md` section 14 (ADR-002)

- **Context:** fullstack type sharing, mature security plugins, schema-driven OpenAPI.
- **Decision:** TypeScript (strict), Node 24 LTS, Fastify 5, Zod 4, `fastify-type-provider-zod`, pino, `jose`, `@node-rs/argon2`, nodemailer, prom-client, date-fns v4 with `@date-fns/tz`.
- **Alternatives rejected:** Python with FastAPI (no ML need, duplicated types); Go (no concurrency or latency driver, second toolchain); NestJS (heavy DI and decorator boilerplate); Express (weaker schema integration).
- **Consequences:** a single language and contract package across the stack. Native argon2 binaries must match the Docker base image, which `node:24-slim` prebuilds cover.

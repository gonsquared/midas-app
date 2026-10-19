# syntax=docker/dockerfile:1
#
# Midas image. Build context is the repository root:
#   docker build -f infra/docker/Dockerfile --target runtime -t midas:local .
#
# Stages:
#   base       Node 24 with pnpm pinned to 10.34.7 through Corepack
#   deps       Workspace manifests and `pnpm install --frozen-lockfile`
#   source     deps + the full source tree
#   web-build  Builds the SPA (apps/web/dist)
#   api-build  Compiles the API to JavaScript (apps/api/dist) and installs production
#              dependencies only (`pnpm deploy --prod`)
#   dev        Whole workspace with dev dependencies; used only by compose.yaml (tsx watch, Vite)
#   runtime    Production image (the default last stage): `node` on compiled JavaScript, production
#              node_modules only, the SPA served by the API from /app/web, non-root, healthcheck
#
# The runtime image holds no .env file or secret: configuration comes from the environment
# (see docs/operations/deployment.md). Build with: docker build -f infra/docker/Dockerfile .

ARG NODE_IMAGE=node:24-bookworm-slim
ARG PNPM_VERSION=10.34.7

FROM ${NODE_IMAGE} AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable \
 && corepack prepare "pnpm@${PNPM_VERSION}" --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN --mount=type=cache,id=midas-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store

FROM deps AS source
COPY . .

FROM source AS web-build
RUN pnpm --filter @midas/web build

FROM source AS api-build
RUN pnpm --filter @midas/api build \
 && pnpm --filter @midas/api deploy --prod --legacy /prod/api

# Local development only (compose.yaml): the whole workspace, dev dependencies included.
FROM ${NODE_IMAGE} AS dev
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=source --chown=root:root /app /app
USER node
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node_modules/.bin/tsx", "src/server.ts"]

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    WEB_DIST_DIR=/app/web
WORKDIR /app
# Root-owned and read-only to the runtime user.
COPY --from=api-build --chown=root:root /prod/api/package.json ./package.json
COPY --from=api-build --chown=root:root /prod/api/node_modules ./node_modules
COPY --from=api-build --chown=root:root /app/apps/api/dist ./dist
COPY --from=web-build --chown=root:root /app/apps/web/dist ./web
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

# Default: HTTP server with the scheduler (SCHEDULER_ENABLED) and the SPA. Migrations are a separate
# one-off step with the same image and the owner credentials:
#   node dist/cli.js migrate && node dist/cli.js seed:system
CMD ["node", "--enable-source-maps", "dist/server.js"]

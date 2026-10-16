# syntax=docker/dockerfile:1
#
# Midas image. Build context is the repository root:
#   docker build -f infra/docker/Dockerfile --target runtime -t midas:local .
#
# Stages:
#   base     Node 24 with pnpm pinned to 10.34.7 through Corepack
#   deps     Workspace manifests and `pnpm install --frozen-lockfile`
#   build    Full source; builds the SPA (apps/web/dist)
#   runtime  Non-root image: API source, migrations, built SPA, healthcheck on /health
#
# TODO(E10-F3-S2): the API runs its TypeScript sources through tsx, so the runtime image keeps the
# full workspace node_modules (dev dependencies included). Compile apps/api to dist/ and prune with
# `pnpm deploy --prod` to shrink the image. Migrations are TypeScript too (apps/api/db/migrations).
# TODO(E10-F1-S2 / static SPA): the API does not serve apps/web/dist yet. The files are copied into
# the image so the static-SPA plugin can serve them without a Dockerfile change.

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

FROM deps AS build
COPY . .
RUN pnpm --filter @midas/web build

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=build --chown=root:root /app /app
USER node
WORKDIR /app/apps/api
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

# Default: HTTP server with the scheduler (SCHEDULER_ENABLED). Migrations run as a separate step:
#   node --import tsx src/cli.ts migrate
CMD ["node", "--import", "tsx", "src/server.ts"]

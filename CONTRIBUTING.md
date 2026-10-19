# Contributing to Midas

Thanks for helping build Midas. This guide describes the setup, checks and conventions every change must follow.

## Prerequisites

- **Node.js 24** (see `.nvmrc`). Use `nvm use` or install Node 24 directly.
- **pnpm 10** via Corepack. Corepack ships with Node; enable it once per machine:

  ```bash
  corepack enable
  ```

  The exact pnpm version is pinned by the `packageManager` field in the root `package.json`.

- **Docker** with Compose runs the local stack (database, Mailpit, API, web) and is needed for the database-backed API tests (Testcontainers). Without Docker those tests are skipped.

## Setup

```bash
pnpm install
cp .env.example .env         # replace every change-me-* placeholder; the API and Docker Compose read this file
```

Never commit `.env` or `.env.*` files other than `.env.example`. Do not put real secrets, tokens or credentials into any tracked file.

## Repository layout

| Path              | Purpose                                                     |
| ----------------- | ----------------------------------------------------------- |
| `apps/api`        | `@midas/api`, the Fastify backend                           |
| `apps/web`        | `@midas/web`, the React and Vite frontend                   |
| `packages/shared` | `@midas/shared`, contracts and utilities shared by the apps |
| `infra/`          | Container, deployment and infrastructure configuration      |
| `e2e/`            | End-to-end test suites                                      |
| `tooling/`        | Shared tooling presets                                      |

Workspace packages are declared in `pnpm-workspace.yaml`. Packages must only import from their declared dependencies (no phantom dependencies across workspaces).

## Daily commands

| Command                              | What it does                                                                |
| ------------------------------------ | --------------------------------------------------------------------------- |
| `pnpm lint`                          | ESLint (flat config) across the repository                                  |
| `pnpm format`                        | Prettier, writes changes                                                    |
| `pnpm format:check`                  | Prettier, fails on unformatted files (used in CI)                           |
| `pnpm typecheck`                     | `tsc --noEmit` in every workspace that defines it                           |
| `pnpm test`                          | Unit tests in every workspace that defines them                             |
| `pnpm build`                         | Builds every workspace that defines a build script                          |
| `pnpm test:coverage`                 | Tests with V8 coverage; thresholds fail the run (CI runs this)              |
| `pnpm test:e2e`                      | Playwright browser tests (see the README for setup)                         |
| `pnpm --filter @midas/api test:perf` | 100,000 transaction performance baseline (needs Docker, not in `pnpm test`) |

Run `pnpm lint && pnpm format:check && pnpm typecheck` before opening a pull request, and `pnpm test:coverage` when you change behaviour, since CI enforces the coverage thresholds.

Browser checks beyond the basic suite: `e2e/tests/a11y.spec.ts` (axe-core) and `e2e/tests/keyboard.spec.ts` run with `pnpm test:e2e`; `e2e/tests/csp.spec.ts` needs the served-build mode below (`E2E_SERVED_BUILD=1`, `E2E_BASE_URL`). Install the browser once with `pnpm --filter @midas/e2e exec playwright install chromium`.

## Code standards

- **TypeScript** in `strict` mode. The shared base config is `tsconfig.base.json`; workspaces extend it.
- **Formatting** is owned by Prettier (`.prettierrc.json`). Do not hand-format around it.
- **Editor settings** come from `.editorconfig`: UTF-8, LF line endings, 2-space indentation, final newline.
- **Money** is stored as integer minor units and dates are handled as dates, not timestamps.
- Keep changes small and focused. One story or fix per branch and pull request.
- Add or update tests with every behaviour change.

## Branches and commits

- Branch from the default branch, `master`, and name branches after the work, for example `feat/sprint-1-foundation` or `fix/login-rate-limit`.
- Use clear, imperative commit messages. A conventional prefix (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`) is preferred.
- Do not force-push to `master`.
- Do not use git worktrees for development in this repository unless a maintainer asks for one.

## Pull requests

1. Open a pull request against `master` and complete the template in `.github/PULL_REQUEST_TEMPLATE.md`.
2. Make sure every check passes: lint, format check, typecheck, tests and build.
3. Link the story or issue the change addresses.
4. Keep the pull request scoped. Refactors and unrelated fixes go in separate pull requests.
5. At least one approving review is required before merge.

## Issues

Use the templates in `.github/ISSUE_TEMPLATE/` for bug reports and feature requests. For security problems, do not open a public issue; follow [SECURITY.md](./SECURITY.md).

## Docker (local stack)

The Compose stack runs PostgreSQL 17, Mailpit (local SMTP and mail UI), the API under `tsx watch` and the web app under the Vite dev server. Source folders are bind-mounted read-only, so edits on the host reload the running services (API restart, web hot module replacement).

```bash
cp .env.example .env          # replace every change-me-* placeholder; never commit .env
docker compose up --build     # db, one-shot migrate, api on :3000, web on http://localhost:5173
```

- Mailpit UI: http://localhost:8025 (SMTP on 1025). Reset emails appear there.
- Open the app at http://localhost:5173; it proxies `/api` to the API. If another Vite dev server is already running on the host it can shadow the container on IPv6 `localhost`; use http://127.0.0.1:5173 or stop it.
- Dependency, lockfile, Vite config and Dockerfile changes need `docker compose up --build`.
- Stop and keep data: `docker compose down`.
- **Reset** (delete the database volume and start empty): `docker compose down -v`, then `docker compose up --build` again. The init script in `infra/db/init` runs only on a new volume.
- Ports are published on 127.0.0.1 only.

The Dockerfile is `infra/docker/Dockerfile` (stages `base`, `deps`, `source`, `web-build`, `api-build`, `dev`, `runtime`). Compose uses the `dev` stage (whole workspace, dev dependencies, tsx and Vite). The `runtime` stage is the production image: compiled JavaScript, production dependencies only, non-root, and the API serves the built web app from the same origin. Build and try it on its own with `docker build -f infra/docker/Dockerfile --target runtime -t midas:local .`; running it needs a migrated database and environment variables, see [docs/operations/deployment.md](./docs/operations/deployment.md). CI builds this image, starts it and runs the whole Playwright suite against it (job "Production image").

To test the built web app under the real CSP on your machine, serve it from the API and point Playwright at it (the Playwright `webServer` cannot find `pnpm` on Windows, so `E2E_BASE_URL` is also the way to run there):

```bash
pnpm build                                        # apps/web/dist and apps/api/dist
cd apps/api && node --env-file=../../.env dist/server.js   # serves ../web/dist (WEB_DIST_DIR)
# in a second terminal, at the repository root:
E2E_BASE_URL=http://localhost:3000 E2E_SERVED_BUILD=1 pnpm test:e2e
```

In PowerShell set `$env:E2E_BASE_URL` and `$env:E2E_SERVED_BUILD` first.

`E2E_SERVED_BUILD=1` makes every test fail on any `securitypolicyviolation` and enables `e2e/tests/csp.spec.ts`. Add `E2E_REAL_API=1` (with `APP_BASE_URL` equal to `E2E_BASE_URL` and a raised `RATE_LIMIT_REGISTER_MAX`) to include the real-API specs.

## Security checks

- **Secret scanning:** the `secret-scan` job in `.github/workflows/ci.yml` runs gitleaks on every pull request and push, with `.gitleaks.toml`. To scan locally, install gitleaks and run `gitleaks dir . --config .gitleaks.toml --redact`.
- **Allowlist process:** a finding that is a placeholder or test-only value can be allowlisted by adding a narrow regex to `.gitleaks.toml` or a path to its `paths` list. Explain the entry in the pull request, and get a maintainer review. Never allowlist a value that could be a real credential. If a real secret is committed, rotate it first (see [SECURITY.md](./SECURITY.md)).
- **Dependency audit:** `pnpm audit --audit-level=high` runs in CI over all dependencies (not `--prod`, because dev tooling runs in CI and on developer machines too; the runtime image itself has production dependencies only) and fails on high or critical advisories. The only accepted advisory is the dev-time `braces` issue reached through `kysely-codegen` (GHSA-vfj7-8cjw-p6xm). To accept another advisory, add its GHSA id to `auditConfig.ignoreGhsas` in `pnpm-workspace.yaml` with a comment giving the reason and the dependency path, in the same pull request.
- **Dependabot** (`.github/dependabot.yml`) opens weekly update pull requests for npm, Docker and GitHub Actions.

## Content Security Policy and the web app

The SPA is served under a strict CSP (`script-src 'self'`, `style-src 'self'`, no `unsafe-inline`). Keep it that way:

- **No runtime-injected `<style>` tags.** A modal Radix Dialog renders `react-remove-scroll`, which injects one and would be blocked. `Dialog` in `apps/web/src/components/ui/dialog.tsx` therefore uses Radix's non-modal mode and supplies the modal behaviour itself (scrim, `aria-modal`, a `scroll-locked` body class styled in `index.css`; Radix keeps Esc, Tab looping and focus return). Do not set `modal` on dialogs, and keep `modal={false}` on dropdown menus. Tests assert that opening dialogs adds no `<style>` node.
- **No inline `style` attributes or scripts in `index.html`.**
- **Dev-only auth bypass.** `VITE_DEV_SKIP_AUTH` works on the dev server only. `vite build` fails if it is set or if mode/NODE_ENV is not production, and CI greps `apps/web/dist` for the fake session and the design-system route.
- `VITE_DEV_HOST` (default `localhost`) opts the dev server in to listening on other interfaces, for example `0.0.0.0`.

## Licence

By contributing you agree that your contributions are licensed under the project licence in [LICENSE](./LICENSE).

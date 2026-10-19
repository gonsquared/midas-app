# v1.0 release checklist

- **Owner:** maintainer cutting the release
- **Status as of 2026-10-19:** NOT ready to tag. Open gates are listed first. Tick a box only after you have done and seen the step; nothing below has been performed by the author of this document.

Deployment details (environment, migrations, rollback, backup) are in [deployment.md](./deployment.md). Day-two triage is in [troubleshoot-api.md](./troubleshoot-api.md).

## Open gates (as of 2026-10-19)

The review summaries, API reference and user guide now exist (`docs/reviews/`, `docs/api/README.md`, `docs/user-guide.md`). Still open:

- [ ] E10-F2-S3: manual screen-reader testing (NVDA, VoiceOver) has not been performed; run it or explicitly waive it. A11Y-02 (wallet row-menu focus return) is fixed. See [accessibility audit](../qa/accessibility-audit.md).
- [ ] README and user guide screenshots are missing (placeholders only; 9 screens listed in the README).
- [ ] The first GitHub run of the `production-image` job and of the coverage CI step has not been observed (verified locally by qa-agent only).
- [ ] Branch protection: update the required checks for the renamed `production-image` job.
- [ ] Version bump: the root `package.json` is still `0.0.0`.
- [ ] Release notes and a GitHub release are not written.
- [ ] Backup and restore: the `pg_dump` and `pg_restore` procedure has not been exercised by QA.
- [ ] Retention purge for `audit_logs` and `recurring_runs` is not implemented (build it or accept and document it for v1.0).
- [ ] The `password-*.js` chunk (about 1.66 MB) is not verified to be lazy loaded.
- [ ] Concurrent load, 50,000-user admin search and 5,000,000-row audit query performance are not measured ([performance baseline](../qa/performance-baseline.md)).
- [ ] qa-agent has not yet set E10-F3-S3, E10-F3-S4 and E10-F3-S5 to Done.

## Before tagging

- [ ] Every story is Done, or documented as deferred in the Final Backlog Review of `docs/dev-stories-tracker.md`.
- [ ] CI is green on the release commit: `lint-test-build` (includes coverage thresholds), `secret-scan`, `dependency-audit`, `production-image`, `e2e`.
- [ ] Branch protection on `master` requires the current job names. The `production-image` job was renamed, so update the required check list in GitHub settings (TODO: confirm the exact name currently registered there) and confirm the new check appears on a pull request.
- [ ] `pnpm audit --audit-level=high` is clean apart from the documented `braces` exception.
- [ ] `pnpm --filter @midas/api test:perf` run on the release commit (not part of CI).
- [ ] README, CONTRIBUTING and `.env.example` match the code (every variable in `apps/api/src/platform/config.ts` is documented).
- [ ] Screenshots in the README are captured (currently a TODO placeholder).

## Secrets and configuration

- [ ] `JWT_ACCESS_SECRET` is a unique random value of at least 43 characters, stored in the platform secret store.
- [ ] `METRICS_TOKEN` (32+ characters) and `AUDIT_HMAC_SECRET` (32+ characters) set if you use `/metrics` and the audit pseudonymization.
- [ ] `APP_BASE_URL` is the public `https` URL; `MAIL_TRANSPORT=smtp` with STARTTLS or implicit TLS; `DATABASE_SSL` is not `off`.
- [ ] `TRUST_PROXY` matches the number of proxy hops.
- [ ] `RATE_LIMIT_ENABLED` is not `false` (the API refuses to start in production if it is).
- [ ] `APP_VERSION` set to the release tag.
- [ ] No real secret is in git (gitleaks job green).

## Database

- [ ] A fresh backup exists and a restore into a new instance has been rehearsed (the `pg_dump` and `pg_restore` commands have not been run by QA).
- [ ] Migrations reviewed. Migration 7 (`create-recurring`) takes locks; see the caution in the deployment guide for databases that already hold data.
- [ ] Run `node dist/cli.js migrate && node dist/cli.js seed:system` with the new image before starting it.
- [ ] First administrator created (`admin:create`, or `BOOTSTRAP_ADMIN_EMAIL` once, then removed).

## Tag and publish

- [ ] Update version references (root `package.json` is `0.0.0` today; TODO: decide whether to bump it).
- [ ] Tag the release commit on `master`, for example `git tag -a v1.0.0 -m "Midas v1.0.0"` and `git push origin v1.0.0` (only when every gate above is closed).
- [ ] Build and push the image with the new tag; never reuse a tag.
- [ ] TODO: release notes and a GitHub release (no template exists yet).

## After deploying

- [ ] `GET /health` returns 200 with the expected `APP_VERSION`; container healthcheck is healthy.
- [ ] Smoke test: the SPA loads with the CSP header, register and sign in, create a wallet and a transaction, view the dashboard, receive a password reset email.
- [ ] `/metrics` answers with the bearer token and 404 or 401 without it.
- [ ] Logs show request ids and no errors; scheduler pass runs.
- [ ] Rollback plan confirmed: redeploy the previous tag; do not revert migrations ([deployment.md](./deployment.md), "Roll back").

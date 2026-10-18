# 13. First admin via CLI, with a one-time bootstrap setting as fallback

- **Status:** Accepted
- **Date:** 2026-10-16
- **Source:** mirrored from `docs/architecture.md` section 14 (ADR-013)

- **Decision:** `cli admin:create` and `cli admin:promote` (audit-logged); optional `BOOTSTRAP_ADMIN_EMAIL` that promotes an existing user once, and only while no admin exists.
- **Alternatives rejected:** first registered user becomes admin (race on public deployments); seeding admin credentials from environment variables (a plaintext password in host config); a database migration with a fixed admin (a secret in the repository).
- **Consequences:** an operator step is required after the first deploy, and the deployment guide documents it.

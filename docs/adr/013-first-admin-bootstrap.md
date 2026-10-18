# 13. First admin via CLI, with a one-time bootstrap setting as fallback

- **Status:** Accepted
- **Date:** 2026-10-16
- **Source:** mirrored from `docs/architecture.md` section 14 (ADR-013)

- **Decision:** `cli admin:create` creates a new admin account and `cli admin:promote` is the explicit, audit-logged way to promote an existing one; optional `BOOTSTRAP_ADMIN_EMAIL` creates its own account once, and only while no admin exists.
- **Amendment (code review H-1):** registration does not verify email ownership, so matching an account by email alone must never grant admin. A person could register the operator's email first and keep a known password. Therefore: `admin:create` fails when the email exists (the check and the insert run in one transaction under the admin-set lock, backed by the unique email index, so a concurrent registration cannot make it silently drop the supplied password); `BOOTSTRAP_ADMIN_EMAIL` never promotes an existing account (it logs an error and does nothing) and otherwise creates the account with a random unusable password, which the owner replaces through the password-reset email; `admin:promote` stays an operator action with shell access and writes `admin.user_role_changed`.
- **Alternatives rejected:** first registered user becomes admin (race on public deployments); seeding admin credentials from environment variables (a plaintext password in host config); a database migration with a fixed admin (a secret in the repository).
- **Consequences:** an operator step is required after the first deploy, and the deployment guide documents it.

# 18. Admin privacy boundary

- **Status:** Accepted
- **Date:** 2026-10-16
- **Source:** mirrored from `docs/architecture.md` section 14 (ADR-018)

- **Decision:** admin capabilities never include reading, per-user aggregation or export of another user's financial records. Admin metrics are platform-wide counts. The audit log excludes financial details and secrets. This is enforced by route design and by authz enumeration tests.
- **Alternatives rejected:** an admin "view as user" mode or per-user financial statistics (privacy risk, outside the brief).
- **Consequences:** support investigations rely on the audit log and the user's own exports.

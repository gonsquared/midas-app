# 7. Short-lived JWT access token in memory, rotating refresh token in an httpOnly cookie, argon2id

- **Status:** Accepted
- **Date:** 2026-10-16
- **Source:** mirrored from `docs/architecture.md` section 14 (ADR-007)

- **Decision:** as specified in §9: 10-minute access JWT, 30-day rotating refresh token with reuse detection and a 20-second grace window, 90-day absolute session, authorization loaded from the database per request.
- **Alternatives rejected:**
  - Pure server-side session cookie: viable and simpler, but the stories require separate access and rotating refresh credentials, and every endpoint would need CSRF defenses.
  - Tokens in localStorage: exposed to XSS.
  - Long-lived JWT without a database check: suspension would be delayed.
  - bcrypt: weaker against GPU attacks than argon2id.
- **Consequences:** an XSS attacker cannot read the refresh token, and suspension takes effect immediately. The cost is one database lookup per request (R1) and refresh coordination across tabs.

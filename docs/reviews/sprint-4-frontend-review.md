# Frontend code review (Sprint 4)

- **Story:** E10-F1-S4
- **Date:** 2026-10-19
- **Initial verdict:** Request changes (one High finding, H2). **Current state:** every finding is Fixed, Accepted with a rationale, or tracked as a known open item; no High or Critical finding remains open.
- **Scope:** the web app (`apps/web`): injection and XSS safety, token and session handling, redirects, secrets, content security policy compatibility, accessibility of shared components, data caching and test quality.

## Security review results

| Area | Result | Evidence |
| --- | --- | --- |
| Unsafe HTML injection | None. No `dangerouslySetInnerHTML`, `innerHTML`, `eval` or equivalents in production source | ESLint bans `dangerouslySetInnerHTML` (`eslint.config.mjs`); `apps/web/src/no-unsafe-html.test.ts` scans production source for `innerHTML` and `outerHTML` assignment, `insertAdjacentHTML`, `document.write`, `eval`, `new Function` and string timers |
| Token storage | The access token is held in memory only. The refresh credential is an `httpOnly`, `SameSite=Strict` cookie named `midas_rt`, sent with the `X-CSRF-Protection` header. Refresh is single-flight under a Web Lock so tabs do not race | `apps/web/src/lib/api-client.ts` and its tests; `no-unsafe-html.test.ts` allows only the theme preference and the last-used wallet id in web storage and forbids token names and `document.cookie` writes; `e2e/tests/auth.spec.ts` and `e2e/tests/real-api.spec.ts` assert the access token never reaches storage and `midas_rt` is not readable by script |
| Open redirects | Blocked. The post-sign-in return path is validated and only in-app paths are accepted | `safeReturnPath` in `apps/web/src/lib/redirect.ts` |
| Secrets and dev bypass | No secrets in the bundle. The development authentication bypass is a compile-time constant that is always false in builds | `apps/web/vite.config.ts`; CI step "Check the web bundle has no dev-only code" |

## Findings

| ID | Severity | Finding | Status | Fix and test |
| --- | --- | --- | --- | --- |
| H2 | High | The single-page app was never exercised under the real Content-Security-Policy against a production build, and the API did not serve the app | Fixed | The API now serves the built app from its own origin (`apps/api/src/platform/web.ts`). A CI job, "Production image", runs Playwright under the real CSP (`e2e/tests/csp.spec.ts`, guarded by `E2E_SERVED_BUILD`). Verified locally: 28 tests passed with 0 CSP violations; later 75 passed against the production image. The first run of this job on GitHub has not yet been observed |
| M1 | Medium | A failed logout call silently signed the user in again | Fixed | A signed-out flag stops session restore, and the sign-in page shows a notice. `apps/web/src/features/auth/api.ts`, `hooks.ts`; test "stays on sign-in and does not refresh with the still-valid cookie when logout fails" in `apps/web/src/features/auth/session-guard.test.tsx`. Caveat: a hard reload while the cookie is still valid, after a logout call that failed, can restore the session |
| M2 | Medium | Non-modal dialogs did not make the background inert for assistive technology | Fixed | A reference-counted inert background in `apps/web/src/components/ui/dialog.tsx`; covered by `apps/web/src/components/ui/ui.test.tsx` and the keyboard checks in `e2e/tests/keyboard.spec.ts` |
| L1 | Low | The Zod JIT capability probe caused a CSP violation | Fixed | `z.config` with the jitless option, in a dedicated build chunk (`apps/web/vite.config.ts`); test `apps/web/src/lib/zod-jitless.test.ts` |
| L2 | Low | A refresh that returned a different user id did not clear the cached data | Fixed | The API client signals the change and the app clears cached server data (`onSessionUserChanged` in `apps/web/src/lib/api-client.ts`); test "signals a user switch when refresh returns a different user, not for the same user" in `apps/web/src/lib/api-client.test.ts` |
| L3 | Low | The lint guard covers only `dangerouslySetInnerHTML` | Accepted, tracked | Partly covered by `apps/web/src/no-unsafe-html.test.ts`, which scans for the other unsafe sinks. A broader lint rule can replace the test later |
| L4 | Low | Flaky chart tests | Fixed | Stabilized; the web suite passes in the coverage run (see `apps/web/src/features/reports/trend-chart.test.tsx` and `reports-page.test.tsx`) |
| L5 | Low | The CSP allows `data:` in `img-src` | Accepted, tracked | The need for `data:` images is unverified. Images come from the same origin and the policy allows no remote hosts. Directive in `apps/api/src/platform/hardening.test.ts` |

## Related accessibility findings (from the accessibility audit)

| ID | Severity | Finding | Status |
| --- | --- | --- | --- |
| A11Y-01 | Moderate | Focus was lost when a dialog opened without a trigger closed | Fixed in `apps/web/src/components/ui/dialog.tsx`; unit test in `apps/web/src/components/ui/ui.test.tsx` and keyboard check K3 |
| A11Y-02 | Moderate | Focus is lost after a confirmation opened from a wallet row menu | Fixed (wallets page); see [the accessibility audit](../qa/accessibility-audit.md). `e2e/tests/keyboard.spec.ts` covers it |

## Not verified

- Whether the large `password-*.js` chunk (about 1.66 MB minified) is loaded lazily, only when the password strength checker is needed, was not verified, and no bundle-size budget exists ([performance baseline](../qa/performance-baseline.md)).
- Manual screen-reader testing has not been performed ([accessibility audit](../qa/accessibility-audit.md)).
- The first GitHub run of the `production-image` CI job has not been observed.

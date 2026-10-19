# Accessibility audit (WCAG 2.1 AA)

- **Story:** E10-F2-S3
- **Date:** 2026-10-19
- **Auditor:** qa-agent (automated tools and Playwright keyboard checks only; see "What was not done")
- **Build under test:** the production build served by the API (`WEB_DIST_DIR`), Chromium, with the real
  Content-Security-Policy (`E2E_SERVED_BUILD=1`)

## Summary

| Check | Result |
| --- | --- |
| axe-core, WCAG 2.0/2.1 A and AA rules, 17 routes in the light and the dark theme | 0 violations (34 route scans) |
| axe-core on an open dialog and an open menu, both themes | 0 violations (2 scans) |
| Token contrast, both themes (WCAG 1.4.3 and 1.4.11) | All 94 checks pass |
| Keyboard checks (Playwright key presses) | 6 of 7 pass; 1 expected failure is a tracked defect (A11Y-02) |
| Screen reader (NVDA, VoiceOver) | **Not performed.** Manual TODO below |
| Defects found | 3 (1 fixed, 2 tracked); 3 further manual areas not yet checked |

## How it is run

- `e2e/tests/a11y.spec.ts`: axe on every main route in both themes, plus an open dialog and an open menu.
  `@axe-core/playwright` 4.13.0 (axe-core 4.13.0), tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`. Any violation of any
  impact fails the test; there is no allowlist. The data is a mocked API (every list has rows), so the pages are
  populated.
- Themes: public pages follow the OS preference (`colorScheme`). Signed-in pages take the theme from the account
  preference, so the spec sets the `data-theme` attribute exactly as the theme provider does.
- Scans wait for finite CSS animations to end: colors fade for 140 ms on a theme change and dialogs fade in for
  200 ms, and a scan taken mid-fade reported contrast failures that no user sees.
- `e2e/tests/keyboard.spec.ts`: the keyboard checklist below.
- `apps/web/src/styles/contrast.test.ts`: contrast ratios computed from the real `tokens.css` in both themes.
- Run: `E2E_BASE_URL=http://localhost:3000 E2E_SERVED_BUILD=1 pnpm test:e2e a11y keyboard` (see CONTRIBUTING.md for
  serving the build), and `pnpm --filter @midas/web test` for the contrast test.

Routes scanned: `/login`, `/register`, `/forgot-password`, `/reset-password` (with a token), `/dashboard`,
`/transactions`, `/wallets`, `/categories`, `/budgets`, `/recurring`, `/reports`, `/settings`, `/admin`,
`/admin/users`, `/admin/categories`, `/admin/audit` and the Not found page.

## Contrast (both themes)

Ratios are computed with the WCAG relative luminance formula from `apps/web/src/styles/tokens.css`. Text needs 4.5:1
(1.4.3); focus indicators, control borders and chart series need 3:1 (1.4.11, 2.4.7). They match the values in
`docs/ui-design.md` section 3.1.

| Pair (foreground on background) | Use | Light | Dark | Needs |
| --- | --- | --- | --- | --- |
| `ink` on `surface` | Primary text, amounts | 16.28 | 14.73 | 4.5 |
| `ink-2` on `surface` | Secondary text, labels | 7.87 | 9.33 | 4.5 |
| `ink-3` on `surface` | Metadata, placeholders | 5.78 | 6.27 | 4.5 |
| `ink-3` on `sunken` | Captions on wells | 4.98 | 7.00 | 4.5 |
| `ink` on `canvas` | Page text | 15.14 | 15.83 | 4.5 |
| `ink-3` on `canvas` | Metadata on the page | 5.37 | 6.75 | 4.5 |
| `primary` on `surface` | Links, selected text | 7.69 | 7.92 | 4.5 |
| `on-primary` on `primary` | Primary button label | 7.91 | 7.89 | 4.5 |
| `on-danger` on `danger` | Destructive button label | 6.57 | 8.00 | 4.5 |
| `income` on `surface` | Income amounts | 6.32 | 9.39 | 4.5 |
| `danger` on `surface` | Errors | 6.39 | 7.53 | 4.5 |
| `warning` on `surface` | Near-limit text | 6.26 | 9.08 | 4.5 |
| `info` on `surface` | Notices | 6.27 | 7.80 | 4.5 |
| `ink` on `primary-tint` | Selected row | 14.36 | 11.82 | 4.5 |
| `primary` on `primary-tint` | Selected nav item | 6.78 | 6.36 | 4.5 |
| semantic text on its 12% tint, and `ink` on that tint | Alerts, badges | at least 4.5 | at least 4.5 | 4.5 |
| `line-strong` on `surface` | Input borders | 3.64 | 3.72 | 3 |
| `line-strong` on `canvas` | Control outlines | 3.39 | 4.00 | 3 |
| `focus-ring` on `canvas` / `surface` / `raised` | Focus indicator | 15.14 / 16.28 / 16.76 | 15.83 / 14.73 / 13.50 | 3 |
| `warning-mark` on `surface` | Meter fill | 4.12 | 7.57 | 3 |
| `brass` on `surface` | Markers (never text) | 3.78 | 8.75 | 3 |
| `series-income` / `series-expense` on `surface` | Chart series | 5.16 / 6.25 | 5.26 / 4.73 | 3 |
| `series-net` / `series-other` on `surface` | Chart series | 16.28 / 5.94 | 14.73 / 5.32 | 3 |

Rendered contrast (what a user sees, including opacity and overlays) is covered by the axe scans, which include the
`color-contrast` rule in both themes. The focus ring is a 2 px `ink` ring with an offset in the adjacent background,
so its contrast is measured against the surface, not against a primary fill (ui-design 3.1, Focus).

## Keyboard checklist (performed with Playwright key presses)

| # | Check | Result |
| --- | --- | --- |
| K1 | The skip link is the first tab stop, becomes visible, and Enter moves focus to the main region | Pass |
| K2 | Every tab stop on the sign-in page has a visible focus indicator, in reading order (email, password, submit) | Pass |
| K3 | A dialog (Create wallet): focus moves in, Tab and Shift+Tab never leave it (14 presses each way), the page behind is inert, Esc closes it, focus returns to the opener | Pass after the A11Y-01 fix |
| K4 | A confirmation (delete budget) opens on Cancel, Esc dismisses it, focus returns to the row's Actions button | Pass |
| K5 | A wallet row-menu confirmation (archive) returns focus to the Actions button | **Fail, tracked as A11Y-02** (recorded with `test.fail`) |
| K6 | The account menu opens with Enter, ArrowDown reaches a menu item, Esc closes it and returns focus to the button | Pass |
| K7 | Client-side navigation moves focus to the new page `h1` | Pass |

## Defects

| ID | Severity | Finding | Status |
| --- | --- | --- | --- |
| A11Y-01 | Moderate (WCAG 2.4.3 Focus Order) | Dialogs opened from a route link or from state (no `Dialog.Trigger`) dropped focus to `<body>` when closed, because the dialog runs in Radix non-modal mode (needed for the CSP) and non-modal Radix only restores focus to a trigger. A keyboard user landed back at the top of the page. | **Fixed** in `apps/web/src/components/ui/dialog.tsx`: `DialogContent` remembers the opener and restores focus when it was lost; callers that handle it themselves (`useReturnFocus`) still win, and focus that another dialog already took is left alone. Unit test in `ui.test.tsx`, e2e K3 |
| A11Y-02 | Moderate (WCAG 2.4.3) | A confirmation opened from a wallet row menu (Archive, Delete) returns focus to `<body>` instead of the row's Actions button, because the menu item that opened it is unmounted and the wallets page does not use `useReturnFocus` (budgets, recurring and admin pages do). Likely the same on other pages that open a `ConfirmDialog` from a menu without `useReturnFocus` (not enumerated). | **Open.** Fix: call `capture()` from the menu item and pass `restore` as `onCloseAutoFocus` on the wallets (and any other) confirmations, as budgets-page does. `e2e/tests/keyboard.spec.ts` carries `test.fail` for it; remove that line when fixed |
| A11Y-03 | Low (best practice, not a WCAG 2.1 A/AA failure) | axe best-practice rule `region` reports some header content and portal content (dialogs, menus) outside a landmark on all signed-in pages. | Open, informational |

## What was not done (manual TODO)

- **Screen reader testing was NOT performed by qa-agent.** Still to do by a person: NVDA with Firefox and Chrome on
  Windows, VoiceOver with Safari on macOS and iOS, TalkBack optional. Suggested script per item: sign in; add a
  transaction from the composer; hear the status line ("Expense added..."); open a dialog and hear its name; read the
  dashboard chart through its table alternative; hide amounts and confirm "Amount hidden" is announced; open the
  budget meter and hear the state in words; use the admin user table and audit expander.
- Not covered by axe or the keyboard run and still to be checked manually: 200% and 400% zoom and reflow (1.4.4, 1.4.10),
  text spacing overrides (1.4.12), forced-colors / Windows high contrast mode, `prefers-reduced-motion` behavior of
  the entry animations, touch target size on phones, and the mobile viewport (axe was run at desktop width only).
- The dev-only design-system route is not scanned (it is not in production builds). The transaction detail route
  and the composer drawer were not scanned separately.
- Firefox and WebKit were not run (Chromium only).

# Midas UI and UX Design

**Status:** Draft v1 for review and implementation. Section 18 (Sprint 2: wallets, categories, transactions) added for E3-F1-S2, E4-F1-S2 and E5-F1-S2
**Owner:** ui-ux-agent
**Last updated:** 2026-10-17
**Related:** [Project brief](./project-brief.md) · [Architecture](./architecture.md) · [API contract](./api-contract.md) · [Database design](./database.md)

This document is the design reference for every Midas screen. It defines the visual direction, tokens, information architecture, flows, page layouts, components, data visualization rules, responsive behavior, accessibility requirements, state patterns, microcopy tone and the category icon and color allowlists. It also lists the data needs that design places on db-agent and the architect. It contains no application code. Where a value must be exact (a hex, a size, a key), it is given in a table so implementers can transcribe it.

Wording in wireframes and the microcopy section is **structural copy**. It proves line counts and layout. It is not final. See [section 17](#17-copy-handoff).

---

## Contents

1. [Users, goals and design principles](#1-users-goals-and-design-principles)
2. [Visual direction](#2-visual-direction)
3. [Design tokens](#3-design-tokens)
4. [Information architecture and sitemap](#4-information-architecture-and-sitemap)
5. [User flows](#5-user-flows)
6. [Page layouts](#6-page-layouts)
7. [Component inventory and structure](#7-component-inventory-and-structure)
8. [Data visualization guidance](#8-data-visualization-guidance)
9. [Responsive behavior](#9-responsive-behavior)
10. [Accessibility (WCAG 2.1 AA)](#10-accessibility-wcag-21-aa)
11. [Empty, loading and error states](#11-empty-loading-and-error-states)
12. [Microcopy and tone](#12-microcopy-and-tone)
13. [Category icon and color allowlists (confirmed)](#13-category-icon-and-color-allowlists-confirmed)
14. [Data needs routed to db-agent](#14-data-needs-routed-to-db-agent)
15. [Security-aware UI notes for the frontend agent](#15-security-aware-ui-notes-for-the-frontend-agent)
16. [Story coverage and open questions](#16-story-coverage-and-open-questions)
17. [Copy handoff](#17-copy-handoff)
18. [Sprint 2 feature specifications (wallets, categories, transactions)](#18-sprint-2-feature-specifications-wallets-categories-transactions)

---

## 1. Users, goals and design principles

### 1.1 Who this is for

| Role | Goal | State of mind | What success feels like |
| --- | --- | --- | --- |
| Everyday user | Know where money went, stay inside a plan, log things quickly | Mildly anxious or avoidant about money. Often logging on a phone, mid-task, in under 15 seconds | "I know where I stand and it took no effort" |
| Planner | Set budgets, recurring bills, review trends monthly | Deliberate, at a desktop, willing to look at tables | "My plan is in the system and it warns me early" |
| Admin (operator) | Keep the product healthy, handle account problems, answer "what happened" | Cautious. Fear of doing the wrong irreversible thing | "I can act with confidence and every action is traceable" |

Platform mix: phone-first for capture (add transaction, check budget), desktop-first for review (transactions, reports, admin). Both must be first class.

### 1.2 Principles

1. **Numbers are the interface.** Money is the content. Amounts get the strongest typographic treatment, a fixed right-aligned position in lists, tabular figures in columns, a true minus sign and an explicit plus sign. Chrome recedes.
2. **An expense is not an error.** Spending is normal. Expenses render in ink with a minus sign. Income renders in the income green with a plus sign. Red is reserved for things that need action: exceeded budgets, failed runs, destructive actions, form errors. This keeps red meaningful and avoids a screen that looks like an alarm all month.
3. **Show the arithmetic.** Every derived figure exposes its working: balance = opening + activity, net = income − expenses, budget remaining = limit − spent, transfer preview "before → after", implied exchange rate. Trust in a finance product comes from numbers the user can check.
4. **Time is a first-class axis.** Budgets and the dashboard show where "now" is inside the period (the pace notch, section 2.3). Ahead of pace and behind pace is more useful than a bare percentage.
5. **Fast capture, careful destruction.** Adding is one keystroke away and never ceremonial. Anything that deletes, archives, suspends or changes a role states exactly what will and will not happen first, and offers the reversible alternative where one exists.
6. **Never color alone.** Every status carries an icon and a text label. Every series is directly labeled or in a legend and has a table view.
7. **Calm authority.** Plain language, no exclamation marks, no blame, no gamification. Celebration is limited to a quiet confirmation at real milestones (first transaction, budget created).
8. **One design system, two densities.** The user area is comfortable (56px ledger rows, generous rhythm). The admin area is compact (36px rows, tighter rhythm) because operators scan many records. Same tokens and components, different density setting.

### 1.3 What was deliberately rejected

| Rejected pattern | Why | What replaces it |
| --- | --- | --- |
| Dark navy or near-black with a gold accent as the brand ("money = gold") | The most common finance look, and the product name invites it | A cool mineral light theme and a petrol-green dark theme. Brass appears only as the time marker and the admin-mode edge |
| Cream paper background with a serif display | Reads as a default editorial look | Cool off-white canvas with a grotesque display face |
| A row of four identical KPI cards at the top of the dashboard | Equal weight on everything, no decision support | A single "Position" band: one hero figure and a ledger-style equation |
| Donut chart for category breakdown | Poor for comparing similar values and for labeling 8 or more slices | Ranked horizontal bars with direct labels |
| Red for all expenses, green for all positives | Makes normal spending look like failure, and fails for color-blind users on its own | Sign, ink and icon carry the meaning. Color is secondary |
| Everything in a rounded card with a soft shadow | Template look, visual noise, nested containers | Sections on the canvas separated by hairline rules. A single `Panel` surface is used only for data regions that behave as a unit |

---

## 2. Visual direction

**Name:** Assay. The idea is a touchstone: the stone a metalworker draws a streak across to test gold. The interface is quiet, mineral and exact, with one warm metal mark that means "now".

### 2.1 Palette in words

| Role | Light theme | Dark theme |
| --- | --- | --- |
| Canvas | Chalk, a cool off-white with a trace of green (`#F2F4F0`) | Petrol, a deep blue-green (`#0E1514`) |
| Ink | Deep verdigris-black (`#14201C`) | Pale mist (`#E8EFEC`) |
| Primary | Pine (`#0B5C4E`) | Lit pine (`#4CC3A8`) |
| Accent | Brass (`#A87908`) | Bright brass (`#E0B340`) |
| Data | Blue for expense series, green for income series | Same hues stepped for dark |

Primary (pine) is for actions and selected states. Brass is not a second brand color. It is used for exactly three things: the pace notch on meters and the period strip, the "today" marker, and the admin-mode edge. Using it that narrowly is what keeps it meaningful.

### 2.2 Type pairing

| Role | Family | Why |
| --- | --- | --- |
| Display, page titles, section headings, hero figure | **Bricolage Grotesque** (variable: weight, optical size, width) | A grotesque with ink-trap detail and real personality at large sizes. Gives the hero figure and headings a recognizable voice without a serif |
| UI, body, tables, forms | **IBM Plex Sans** (variable if available, otherwise static 400/500/600) | Excellent figures, tabular numerals, clear at 14px, and a sober contrast to the display face |
| Identifiers only (request IDs, UUID fragments, audit raw action codes) | **IBM Plex Mono** | Functional use only, never for decoration or labels |

Rules: self-host WOFF2 (the CSP allows `font-src 'self'` only), Latin and Latin-extended subsets, `font-display: swap` with size-adjusted fallback fonts so the swap causes no layout shift (CLS ≤ 0.1). Total font payload target: under 130 KB. Preload only the Plex Sans regular and the Bricolage headline file. Tabular figures (`font-variant-numeric: tabular-nums`) in tables, axis ticks and any column of numbers. Proportional figures for the hero figure and stat values.

### 2.3 Signature element: the pace notch

A budget meter or period strip is a horizontal track. A small brass vertical tick marks how far through the period today is. The fill shows how much has been spent. The relationship between the two answers the question users actually have: "am I ahead of or behind my plan?"

```
Groceries                                            $320.00 of $400.00
[##########################################|-----------]
                                           ^ brass notch: 58% of the month elapsed
80% used. $80.00 left. 13 days to go.   State: Near limit
```

The notch is informational. The state badge (On track, Near limit, Over) always comes from the API's `state`, never from the pace. The notch appears on every budget meter, the dashboard period strip and the budget form preview. It is the one memorable device. Everything else is deliberately quiet.

### 2.4 Layout language

- **Ledger grid.** Lists and tables follow an accounting-ledger rhythm: a fixed-width leading column for the category chip or date, a flexible description column, and a right-aligned amount column. Amounts always end on the same vertical line so the eye can sum down the page.
- **Rules, not boxes.** Page sections sit on the canvas, separated by 1px rules and a 40px vertical rhythm. The `Panel` (surface fill, 1px border, 8px radius) is reserved for a chart, a meter list or a table that works as one unit. Panels are never nested.
- **Asymmetry with purpose.** Desktop dashboards use an 8/4 and 5/7 split so the primary reading column is wide and supporting content sits beside it. The layout never centers a single column of equal cards.
- **Alignment.** Text is left aligned (start aligned for RTL). Amounts are end aligned. Dialog and form content is a single column except for paired fields (date and wallet, amount and currency).
- **Shape.** Radii: 4px (inputs, chips), 8px (buttons, panels), 12px (dialogs, sheets), full circle only for avatars. No pill-shaped buttons. No glassmorphism, no gradients, no decorative blobs.
- **Elevation.** Panels have no shadow, only a border. Popovers and menus use one soft shadow. Dialogs and sheets use a scrim plus one larger shadow. In dark theme, hierarchy comes from surface lightness steps and borders, not shadows.

---

## 3. Design tokens

Tokens are CSS custom properties exposed through the Tailwind v4 `@theme` block (for example `--color-canvas`, `--color-ink`). Components consume tokens, never raw hex. The theme is set by a `data-theme` attribute on the root element (`light` or `dark`, resolved from the `system` preference). Both themes are designed, not derived by inversion.

### 3.1 Color tokens

Contrast values were computed against the surface the token is used on (WCAG relative luminance). "Text" tokens target 4.5:1 or better. "Graphic" tokens target 3:1 or better.

**Surfaces and lines**

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `canvas` | `#F2F4F0` | `#0E1514` | Page background |
| `surface` | `#FBFCFA` | `#141D1B` | Panels, inputs, table bodies |
| `raised` | `#FFFFFF` | `#1A2523` | Popovers, menus, dialogs |
| `sunken` | `#E8ECE7` | `#0A100F` | Wells, track backgrounds, code blocks |
| `line` | `#D6DCD5` | `#26332F` | Hairline rules and panel borders (decorative) |
| `line-strong` | `#7A8780` | `#67796F` | Input borders and control outlines (3.6:1 and 3.7:1 on `surface`) |
| `scrim` | `rgba(10,16,15,0.5)` | `rgba(0,0,0,0.6)` | Behind dialogs and sheets |

**Text**

| Token | Light | Dark | Contrast on `surface` | Use |
| --- | --- | --- | --- | --- |
| `ink` | `#14201C` | `#E8EFEC` | 16.3 / 14.7 | Primary text, amounts |
| `ink-2` | `#44534E` | `#B4C2BD` | 7.9 / 9.3 | Secondary text, labels |
| `ink-3` | `#586762` | `#8FA09A` | 5.8 / 6.3 (5.0 on `sunken`) | Metadata, placeholders, captions. Never below 4.5:1 |

**Brand and accent**

| Token | Light | Dark | Notes |
| --- | --- | --- | --- |
| `primary` | `#0B5C4E` | `#4CC3A8` | Buttons, links, selected state. 7.7 / 7.9 on `surface` |
| `primary-hover` | `#084A3F` | `#6AD2BB` | |
| `on-primary` | `#FFFFFF` | `#04201A` | Text on primary fills. 7.9 / 7.9 |
| `primary-tint` | `#E8EFEC` | `#1B312C` | Selected row, selected nav item background |
| `brass` | `#A87908` | `#E0B340` | Pace notch, today marker, admin edge only. 3.8 / 8.8 on `surface`. Never used as text |

**Semantic**

| Token | Light | Dark | Use | Notes |
| --- | --- | --- | --- | --- |
| `income` | `#0B6B4F` | `#5FD3B4` | Income amounts (text) | 6.3 / 9.4 on `surface` |
| `danger` | `#B42318` | `#FF8A80` | Errors, exceeded, destructive | White on danger fill: 6.6. Dark mode uses `#2B0A07` text on the danger fill: 8.0 |
| `warning` | `#8A5100` | `#F0B14A` | Near-limit, caution (text and icon) | 6.3 / 9.1 |
| `warning-mark` | `#B26A00` | `#E0A030` | Meter fill for the warning state (graphic) | 4.1 / 7.6 |
| `info` | `#1D5FA8` | `#7FB2F0` | Neutral notices | 6.3 / 7.8 |
| `*-tint` | token at 10 to 14% over `surface` | same | Backgrounds for alerts and badges. Text on tint stays at 5.2:1 or better in both themes |

**Focus**

| Token | Light | Dark |
| --- | --- | --- |
| `focus-ring` | `ink` (`#14201C`) | `ink` (`#E8EFEC`) |

Focus is a 2px solid ring in `ink` with a 2px offset in the adjacent background color. It is visible on every surface in both themes (above 14:1) and distinct from the pine primary fill. Never remove the outline without replacing it.

**Chart tokens** (selected per theme, validated with the palette validator against `surface`; see section 8)

| Token | Light | Dark |
| --- | --- | --- |
| `series-income` | `#0B7A5C` | `#1FA085` |
| `series-expense` | `#2358C4` | `#3987E5` |
| `series-net` | `#14201C` (ink) | `#E8EFEC` (ink) |
| `series-other` (the "Other" bucket) | `#55646E` | `#7F929D` |
| `grid` | `#E3E7E1` | `#26332F` |
| `axis` | `#C2CAC3` | `#3B4B46` |

Category colors are defined in [section 13](#13-category-icon-and-color-allowlists-confirmed).

### 3.2 Typography scale

| Style | Family | Size / line height | Weight | Notes |
| --- | --- | --- | --- | --- |
| `figure-hero` | Bricolage | 56/60 (40/44 below 640px) | 600 | One per view. Proportional figures. Fluid between 40 and 56 using container width. Must not wrap or truncate digits |
| `figure-lg` | Bricolage | 28/32 | 600 | Stat values (net, income, expenses, admin counts) |
| `title` | Bricolage | 28/34 (24/30 on mobile) | 600 | Page title (the `h1`) |
| `heading` | Bricolage | 20/28 | 600 | Section heading (`h2`) |
| `subheading` | Plex Sans | 16/24 | 600 | `h3`, panel titles |
| `body` | Plex Sans | 16/24 | 400 | Maximum 70 characters per line |
| `body-sm` | Plex Sans | 14/20 | 400 and 500 | Tables, dense lists, helper text |
| `label` | Plex Sans | 14/20 | 500 | Form labels, column headers (sentence case) |
| `amount` | Plex Sans | 16/24 (row), 14/20 (compact) | 500 | Tabular figures, end aligned |
| `caption` | Plex Sans | 12/16 | 400 | Never the only place essential information appears. Minimum size 12px |
| `mono` | Plex Mono | 13/20 | 400 | Identifiers only |

Only weights 400, 500 and 600 appear in the UI font. No all-caps labels anywhere (column headers and field labels are sentence case). Inputs on touch devices use 16px so iOS does not zoom.

### 3.3 Spacing, radii, borders

| Token | Value |
| --- | --- |
| Spacing scale (4px base) | 0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 56, 72 |
| Page gutter | 16 (mobile), 24 (tablet), 32 (desktop) |
| Section rhythm | 40 (desktop), 32 (mobile) |
| Content max width | 1280 for pages, 720 for forms and settings, 400 for auth forms |
| Radius | `r-sm` 4, `r-md` 8, `r-lg` 12 |
| Border | 1px `line`; controls 1px `line-strong` |
| Control height | 40 desktop, 44 touch (coarse pointer). Small control (toolbar, admin) 32 desktop |
| Touch target | 44 x 44 minimum on touch layouts. 32 x 32 minimum on desktop (above the WCAG 2.2 24px floor even though 2.1 AA does not require one) |
| Row height | Ledger 56 comfortable, 44 compact. Admin table 36 |

### 3.4 Motion

| Token | Duration | Easing | Use |
| --- | --- | --- | --- |
| `motion-instant` | 80ms | ease-out | Press feedback, toggles |
| `motion-fast` | 140ms | ease-out | Hover, focus, menu open, number crossfade |
| `motion-base` | 200ms | cubic-bezier(0.2, 0, 0, 1) | Dialog and sheet enter, drawer slide |
| `motion-meter` | 400ms | ease-out | Meter fill after a value changes (not on first paint) |

Motion only answers an action or shows a state change: overlays enter, an inserted row is highlighted for 1.2s, a meter fills to its new value, a number crossfades when it changes. No page-load choreography, no scroll animation, no hover lifts. With `prefers-reduced-motion: reduce`, all transforms and fades are removed (state changes are instant) and the row highlight becomes a static 2px left rule that remains until the next interaction.

### 3.5 Layering (z-index)

| Layer | Value |
| --- | --- |
| Base content | 0 |
| Sticky table header, sticky day header | 10 |
| App header, bottom navigation | 20 |
| Popover, menu, tooltip, combobox listbox | 40 |
| Drawer, sheet | 50 |
| Dialog and scrim | 60 |
| Toast region | 70 |
| Skip link (when focused) | 80 |

### 3.6 Breakpoints

| Name | Min width | Meaning |
| --- | --- | --- |
| `xs` | 480 | Large phone. Two-column forms become possible |
| `sm` | 640 | Tailwind default |
| `md` | 768 | Tablet. Icon rail replaces the bottom bar |
| `lg` | 1024 | Laptop. Full sidebar |
| `xl` | 1280 | Desktop. Dashboard 12-column layout |
| `2xl` | 1536 | Large desktop. Master-detail on transactions |

Components that live in variable-width regions (tables, ledger rows, chart panels) use container queries so they adapt to the width they are given, not to the viewport. See section 9.

### 3.7 Density

A `density` setting (`comfortable`, `compact`) changes row height, vertical padding and the control height of table toolbars. The user area defaults to comfortable. The admin area defaults to compact. The transaction list offers a visible toggle (stored in local storage, not on the server).

---

## 4. Information architecture and sitemap

### 4.1 Core objects and relationships

Wallet (holds money) → Transaction (income, expense, transfer legs) ← Category (classifies). Budget limits a Category (or everything). Recurring template generates Transactions. Reports aggregate Transactions. Admin works on Users, system Categories, platform aggregates and the Audit log, and never on another user's financial objects.

### 4.2 Sitemap and routes

Route files follow the architecture: `_public`, `_app`, `_app/admin`. Filters and ranges live in typed URL search params so views are linkable and the back button works.

```
Public
  /login                       Sign in
  /register                    Create account
  /forgot-password             Request reset link
  /reset-password              Choose new password (token in URL fragment)

App (signed in)
  /dashboard                   Overview. ?range | ?from&to, ?currency
  /transactions                Ledger.   ?from&to&wallet&category&type&q&min&max&sort&density
    /transactions/new          Composer over the list (full form)    ?type=expense|income|transfer
    /transactions/$id          Detail and edit over the list
  /wallets                     Wallets.  ?archived=1
    /wallets/new  /wallets/$id/edit
  /categories                  Categories. ?type=expense|income
    /categories/new  /categories/$id/edit
  /budgets                     Budgets.  ?date&period
    /budgets/new  /budgets/$id/edit
  /recurring                   Recurring. ?status
    /recurring/new  /recurring/$id/edit  /recurring/$id/runs
  /reports                     Reports.  ?from&to&currency&groupBy&type
  /settings                    Redirects to /settings/profile
    /settings/profile  /settings/preferences  /settings/security

Admin (role admin only)
  /admin                       Platform overview (aggregates)
  /admin/users                 ?q&role&status&sort&page&pageSize
    /admin/users/$id           Detail drawer over the list
  /admin/categories            Default categories. ?type&retired
  /admin/audit                 ?actor&action&targetType&targetId&from&to

System
  /                            Redirects to /dashboard when signed in, otherwise /login
  *                            Not found page
```

Overlay routes (`/new`, `/$id`, `/$id/edit`) render in a drawer on desktop and a full-height sheet on mobile, on top of the list that opened them. They are real URLs, so closing returns to the same list state, and the browser back button closes the overlay.

### 4.3 Navigation model

One primary navigation, one global action, one user menu. No competing navigation layers.

| Group | Items | Notes |
| --- | --- | --- |
| Overview | Dashboard | |
| Money | Transactions, Wallets, Budgets, Recurring | Ordered by frequency of use |
| Insight | Reports | |
| Setup | Categories | |
| Account (user menu, bottom of rail, top right on mobile) | Settings, theme (Light, Dark, System), Hide amounts, Sign out | Sign out is always one tap from the menu |
| Administration (admins only, separated section) | Overview, Users, Default categories, Audit log | See below |

Global action: **Add** (primary button in the header on desktop, center button of the bottom bar on mobile). It opens a menu with Expense, Income, Transfer, and defaults to Expense when pressed directly (so the common case is one tap). The command palette (Ctrl or Cmd + K) offers navigation, the same three add actions, transaction search and theme switching.

**Admin variant.** Admin items live in a visually separated section at the bottom of the rail under the heading "Administration". While in any `/admin` route, the app header shows a 3px brass bottom edge and an "Administration" label, and the page uses compact density. A one-line privacy statement ("Admin tools show account status and platform totals only. They never show anyone's transactions, wallets or budgets.") appears on the overview and the users page. Non-admins never see these items, and `/admin/*` renders the standard Not found page for them (no hint that the area exists). If the API returns 403 on an admin call (role changed mid-session), redirect to the dashboard with a status message.

**Breadcrumbs.** Used only in admin detail views and settings sub-pages where depth is 2 or more. Elsewhere the page title is enough.

---

## 5. User flows

Notation: `[screen]` is a screen or state, `{decision}` a branch, `->` the next step. Error codes in parentheses are from the API contract.

### 5.1 Register

```
[/register] -> enter display name, email, password
  password: strength meter updates live (lazy-loaded checker), show/hide toggle
  regional defaults line: "United States · USD · en-US · America/New_York  Change"
-> {client validation passes?}
     no  -> inline errors, focus first invalid field
     yes -> POST /auth/register (submit button shows spinner, stays enabled-looking, ignores repeats)
-> {response}
     201            -> in-memory session set -> /dashboard (first-run state, 5.4)
     400 WEAK_PASSWORD -> password field error + checker hints, input preserved
     409 EMAIL_TAKEN  -> email field error with neutral wording and a Sign in link (see 15.2)
     429            -> form-level message with live retry countdown
     network/500    -> form-level error with retry, input preserved
```

### 5.2 Sign in, session, sign out

```
[/login] -> email + password -> POST /auth/login
  200 -> go to the validated return path, else /dashboard
  401 INVALID_CREDENTIALS -> one generic message above the form; both values kept; focus on password
  403 ACCOUNT_SUSPENDED   -> "This account is suspended" state with guidance, no retry loop
  429 -> message + countdown from Retry-After; submit shows "Try again in 0:42" and is aria-disabled

[any app page]
  access token expires -> silent refresh (single-flight across tabs) -> request retried, user sees nothing
  refresh fails (SESSION_INVALID) -> /login?reason=expired with status message "You were signed out. Sign in to continue." and a validated return path

[user menu] -> Sign out -> POST /auth/logout -> clear client state -> /login with status "You've signed out."
```

### 5.3 Forgot and reset password

```
[/forgot-password] -> email -> POST /auth/password/forgot
  202 always -> same-screen confirmation: "If an account exists for {email}, we've sent a link. It expires in 30 minutes."
                Resend available after a 60 second cooldown (live countdown). Never says whether the account exists.
  429 -> cooldown message

[email link -> /reset-password#token=...]
  on load: read token from fragment, remove it from the address bar and history (replaceState), POST /reset/verify
  {token valid?}
     no / missing -> invalid-link state: "This link has expired or was already used." [Request a new link]
     yes -> new-password form (strength meter, show/hide, requirements)
          -> POST /reset
               204 -> /login with status "Password updated. Sign in with your new password." (all sessions were revoked)
               400 RESET_TOKEN_INVALID -> invalid-link state (token expired while typing)
               400 WEAK_PASSWORD -> field error, input preserved
```

### 5.4 First-run onboarding

Not a blocking wizard. A user can reach any screen immediately. The dashboard in first-run state leads them through three steps, with visible progress (goal gradient), derived entirely from existing data (no onboarding table).

```
Register -> /dashboard (no wallets, no transactions)
 Setup panel (replaces the empty Position band, steps shown as a progress line "1 of 3"):
   1. Create a wallet        (inline mini-form on the dashboard: name, type, currency prefilled, opening balance)
   2. Add your first expense (inline quick-add, wallet preselected, focus on amount)
   3. Set a monthly budget   (optional: "Pick a category and a limit")
 After step 1 the panel advances without a page change. After step 2 the Position band, trend and recent list
 populate in place and a single status line confirms ("Added. Your balance is now $1,234.50.").
 The panel stays until all three steps are done or the user dismisses it (dismissal stored locally).
 Each step has "Skip for now". Default categories need no setup, they are already available.
```

### 5.5 Add a transaction (the primary loop)

```
Entry points: Add button (header / bottom bar / command palette), quick-add bar on /transactions, "Add" in empty states
[Composer] type = Expense (default; Income | Transfer switch with one tap)
  amount (focus on open) -> category (recent categories first, then search) -> wallet (last used) -> date (today) -> note (optional)
  Enter in any single-line field submits. Ctrl/Cmd + Enter submits from the note field.
-> {valid?} no -> inline errors, focus first invalid
-> POST /transactions
     201 -> quick-add bar: row is inserted at the top, highlighted, fields reset except type/wallet/date, focus returns to amount
            drawer/sheet: closes, toast "Expense added. Checking is now $1,180.00" with a [View] action (no Undo in v1, see DN-9)
            if a budget crossed into warning or exceeded: second status message names the budget (6.9)
     409 WALLET_ARCHIVED   -> wallet field error "This wallet is archived. Choose another wallet."
     422 CATEGORY_RETIRED  -> category field error, category list refreshed
     422 CATEGORY_TYPE_MISMATCH / INVALID_REFERENCE -> refetch wallets and categories, message "Some options changed. Check your choices."
     network -> form-level error, input preserved, [Try again]
Edit: row click -> detail/edit overlay -> PATCH. Delete: always confirmation (flow 5.6).
Switching type clears the category (types do not share categories) and says so in a polite status line.
```

### 5.6 Delete a transaction

```
Overflow menu or detail overlay -> Delete -> dialog:
  "Delete this expense? $54.20, Groceries, 16 Oct. Checking will go up by $54.20. This can't be undone."
  [Cancel] [Delete expense]  (danger)
-> DELETE -> 204 -> row removed, status "Expense deleted. Checking is now ..."
Transfer legs: dialog title "Delete this transfer?" and body states both wallets change and both rows are removed.
Recurring-generated: body adds "This was added by a recurring transaction. It won't be added again."
```

### 5.7 Transfer between wallets

```
Add > Transfer (needs two active wallets; otherwise the empty state "Transfers need two wallets" with [Create a wallet])
[Transfer form] From wallet, To wallet (swap button between them), Amount, [They receive] (only if currencies differ), Date, Note
  live preview under the fields: "Checking  $1,200.00 -> $1,000.00     Savings  $5,000.00 -> $5,200.00"
  currencies differ: second amount required; implied rate shown as "About 1 USD = 0.92 EUR" (informational, rounded)
-> POST /transfers
     201 -> close, toast "Moved $200.00 from Checking to Savings", balances and lists refresh
     422 SAME_WALLET_TRANSFER -> To field error; 422 TO_AMOUNT_REQUIRED / TO_AMOUNT_MISMATCH -> receive-amount field error
     409 WALLET_ARCHIVED -> wallet field error
```

### 5.8 Budgets

```
[/budgets] period navigator (Oct 2026 < >) -> list grouped "Needs attention" then "On track"
 Create: [Create budget] -> scope (Overall | Category) -> category (expense, non-retired; ones that already have a budget are disabled with "Already has a budget")
         -> period (Monthly default) -> limit -> warn-at threshold (80 default, with a live preview meter) -> [Create budget]
         409 BUDGET_EXISTS -> inline on the scope/category field with a link to the existing budget
 Edit: scope, category, period and currency are shown read-only with the line "To change these, delete the budget and create a new one."
       limit and threshold editable; notice "Changing the limit also changes how past periods look."
 Delete: dialog "Delete this budget? Your transactions aren't affected." [Cancel] [Delete budget]
 Warnings: see 6.9 for badges and announcements.
```

### 5.9 Recurring transactions

```
[/recurring] -> [Create recurring] -> type (Expense | Income), name, amount, wallet, category, note
   schedule: "Repeats every [1] [month v]" + starts [date] + ends [Never | On date]
   live preview "Next dates": 5 dates from POST /recurring-templates/preview (debounced 300ms, polite live region)
   month-end clamping is explained: "31 Jan, 28 Feb, 31 Mar. Dates that don't exist in a month move to its last day."
   start date in the past (up to 31 days): notice "3 earlier dates will be added shortly after you save."
 Save -> 201 -> list shows it Active with next date.
 Pause / Resume: immediate, optimistic; toast explains no backfill: "Paused. Nothing is added while paused, and missed dates aren't added later."
 Template paused by the system (5 failures, archived wallet, retired category): row shows the reason and the fix, [Resume] handles errors:
   409 WALLET_ARCHIVED -> "Unarchive {wallet} first" link; 422 CATEGORY_RETIRED -> "Choose a new category" link to edit
 Run history: drawer with occurrence date, outcome (icon + text), link to the generated transaction when present.
 Delete: dialog "Delete this recurring transaction? Transactions it already added stay in your ledger."
```

### 5.10 Reports

```
[/reports] set range (preset or custom, max 1830 days) and currency -> trend + breakdown + summary equation update together
 Group by: Auto (default per range) | Day | Week | Month. >400 buckets -> RANGE_TOO_LARGE message with suggested grouping.
 Breakdown: Expenses | Income switch. Clicking a bar -> /transactions filtered to that category, type and range.
 Every chart has a Chart | Table switch. [Export transactions for this range] links to the CSV export with the same range.
```

### 5.11 Admin tasks

```
Suspend a user:   /admin/users -> search -> open row -> [Suspend] -> dialog (effects, optional reason) -> POST /suspend
                  -> 200 status updated in place, row badge changes, toast "Account suspended. They were signed out on all devices."
                  -> 409 CANNOT_MODIFY_SELF / LAST_ADMIN -> inline dialog error, dialog stays open
Reactivate:       open row -> [Reactivate] -> one-step confirm -> POST /reactivate
Change role:      open row -> Role control -> dialog stating exactly what the role can do -> PATCH /role -> takes effect on their next request
Default categories: /admin/categories -> create / edit / retire / restore (retire dialog explains existing data is untouched)
Platform health:  /admin -> aggregates with "Updated {time}" (cached up to 5 minutes)
Investigate:      /admin/audit -> filter by actor / action / date, or follow "View audit trail" from a user -> expand a row for metadata
```

---

## 6. Page layouts

Wireframes are structural. `[ ]` is a control, `( )` a segmented or radio choice, `{ }` a dynamic region, `~~~` a chart. Widths are illustrative.

### 6.1 App shell

**Desktop (lg and up, 1024+)**

```
+---------------------------------------------------------------------------------------------+
| (skip to main content: visible on focus)                                                    |
+--------------+------------------------------------------------------------------------------+
| Midas |      |  Dashboard                          [eye Hide amounts] [Search  Ctrl K] [+ Add v] [(KM) v]|
|              +------------------------------------------------------------------------------+
| Overview     |                                                                              |
|  > Dashboard |   main  (max width 1280, 32px gutters, h1 receives focus on route change)    |
| Money        |                                                                              |
|    Transactions                                                                             |
|    Wallets   |                                                                              |
|    Budgets   |                                                                              |
|    Recurring |                                                                              |
| Insight      |                                                                              |
|    Reports   |                                                                              |
| Setup        |                                                                              |
|    Categories|                                                                              |
|              |                                                                              |
| Administration  (admins only)                                                               |
|    Overview  |                                                                              |
|    Users     |                                                                              |
|    Default categories                                                                       |
|    Audit log |                                                                              |
| [(KM) Kim M. v]                                                                              |
+--------------+------------------------------------------------------------------------------+
 rail 232px; the active item has primary-tint background, a 3px primary left edge and aria-current="page"
```

**Tablet (md, 768 to 1023):** icon rail 64px with labels as tooltips that also show on keyboard focus and a visible expand button (overlay rail with labels). Header keeps title, Add and user menu. Search collapses to an icon button.

**Mobile (below 768)**

```
+-----------------------------------+            +-----------------------------------+
| Dashboard                 (KM)    |            | More                              |
| [Oct 2026  v]                     |            | Wallets                           |
|                                   |            | Recurring                         |
|  {page content, single column}    |            | Reports                           |
|                                   |            | Categories                        |
|                                   |            | Settings                          |
|                                   |            | Administration  (admins)          |
|                                   |            | Theme  (Light)(Dark)(System)      |
|                                   |            | Hide amounts                      |
+-----------------------------------+            | Sign out                          |
| Home | Activity | [ + ] | Budgets | More |      +-----------------------------------+
+-----------------------------------+
 bottom bar 56px + safe-area inset; center Add is a 48px primary button; labels always visible
```

Skip link, a single `main` landmark, `nav` landmarks labeled "Primary" and (admin) "Administration", and a polite live region for route announcements are in the shell.

### 6.2 Auth screens

All auth pages: 400px form column, page `title` and an `h1`, no navigation chrome except the wordmark. On `lg` and up, the right half shows a **ledger specimen**: a static, `aria-hidden` miniature of the Position band and one budget meter with the pace notch, captioned "Sample data". It is product evidence rather than decoration, it uses no images, and it is hidden below 1024px.

```
Sign in
+----------------------------------------------+------------------------------------------+
|  Midas                                        |                                          |
|                                               |   Sample data                            |
|  Sign in                                      |   Total balance      $12,480.20          |
|  {alert: Email or password is incorrect.}     |   Income  $4,200 - Expenses $3,100       |
|                                               |    = Net +$1,100                         |
|  Email                                        |   Groceries   [#####|---]  $320 of $400  |
|  [ you@example.com                         ]  |                                          |
|  Password                                     |   (static, aria-hidden)                  |
|  [ ************************   ] [Show]        |                                          |
|                       Forgot password?        |                                          |
|  [ Sign in ]                                  |                                          |
|                                               |                                          |
|  New to Midas? Create an account              |                                          |
+----------------------------------------------+------------------------------------------+

Create account                                      Forgot password
  Display name  [                ]                    Email [                  ]
  Email         [                ]                    [ Send reset link ]
  Password      [          ] [Show]                   Back to sign in
  {strength meter: Weak | Fair | Good | Strong
   "Use 12 or more characters. Avoid common words."}
  Regional defaults: United States - USD - en-US
  - America/New_York   [Change]
  [ Create account ]
  Already have an account? Sign in

Reset password (valid token)                        Reset password (invalid link)
  New password [          ] [Show]                    This link has expired or was already used.
  {strength meter + requirements}                     [ Request a new link ]
  [ Update password ]                                 Back to sign in
```

Fields: `autocomplete="username"` (email, with `type="email"`), `current-password` on sign in, `new-password` on register, reset and change password, `name` on display name. The email field has `autocapitalize="none"` and `spellcheck="false"`. Regional defaults are a disclosure (collapsed by default) showing the detected values so most people never touch it.

### 6.3 Dashboard

The dashboard answers, in order: where do I stand, what needs attention, how is the period going, where did it go, what just happened.

**Desktop (xl, 12 columns)**

```
+-------------------------------------------------------------------------------------------------+
| Dashboard                       [<] October 2026 [>]  [This month v]  {USD | EUR}      [+ Add v]   |
+-------------------------------------------------------------------------------------------------+
| {Attention strip: shown only when something needs action}                                       |
|  (!) Groceries is over its monthly budget by $45.20      (!) Dining is at 85%      [View budgets]|
+-------------------------------------------------------------------------------------------------+
| Position                                                    | Wallets                    [All >]  |
|  Total balance                                              | Checking          $1,180.00         |
|  $12,480.20                                  (hero 56px)    | Savings           $9,200.00         |
|  across 4 wallets                                           | Cash                $100.20         |
|                                                             | Visa             -$2,400.00 (owed)  |
|  October 2026                                               |                                     |
|  Income $4,200.00  -  Expenses $3,100.40  =  Net +$1,099.60 |                                     |
|  [========== period strip, day 16 of 31 ==|=============]   |                                     |
+----------------------------------------------------------+--+-------------------------------------+
| Income and expenses            [Chart|Table]  weekly        | Budgets                  [Manage >] |
|  ~~~ clustered columns + net line ~~~                       |  Overall  [#####|----]  $3,100/$4,000|
|  ~~~                                                        |  Groceries [######|--] OVER by $45  |
|  legend: Income  Expenses  Net                              |  Dining    [####|---]  85%  Near    |
|                                                             |  Transport [##|-----]  40%  On track|
+-------------------------------------------+-----------------+-------------------------------------+
| Where it went                [Expenses|Inc]| Recent activity                      [All activity >]  |
|  Housing        =============  $1,200  39%| Fri 16 Oct                                              |
|  Groceries      ==========       $845  27%|  (cart) Groceries   Checking          -$54.20          |
|  Dining         ====             $310  10%|  (brief) Salary     Checking       +$4,200.00          |
|  Other (5)      ===              $420  14%| Thu 15 Oct                                              |
|  Total $3,100.40  Transfers excluded       |  (bus) Transport    Visa               -$18.00          |
+-------------------------------------------+---------------------------------------------------------+
| Coming up (next 14 days)   [rent  1 Nov  -$1,200]  [salary 28 Oct +$4,200]  [phone 30 Oct -$40]  [Manage >]|
+-------------------------------------------------------------------------------------------------+
```

Hierarchy and attention path: the hero figure is the largest element on the page and is the only `figure-hero`. The attention strip, when present, is the second thing the eye meets because it is the only element using a tinted full-width band. Panels below are quiet.

Behavior and rules:

- **Range control** applies to every widget, is stored in the URL (`range` preset key or `from` and `to`), and has previous and next arrows for whole-month presets. The "Total balance" and wallet balances are current balances and say so ("as of today") when the selected range does not end today.
- **Multiple currencies:** a currency switch appears beside the range control only when `totalsByCurrency` has more than one entry. It changes the hero, the equation, both charts (via the `currency` parameter) and filters the budgets to that currency. Totals are never summed across currencies. Wallet list shows each wallet in its own currency.
- **Position equation:** `Income − Expenses = Net` makes the arithmetic visible. Net is `income` colored when positive and `ink` with a minus when negative (not red).
- **Period strip:** a slim track showing days elapsed in the selected range with the brass today notch. Hidden when the range is entirely in the past.
- **Wallets list:** the API returns wallets sorted by name. Show at most 5 and link to Wallets. A negative balance on a card wallet shows "owed" text. See 6.5 for the negative-balance rule.
- **Budgets widget:** shows up to 4 budgets, the exceeded and warning ones first, then by percent used. Each uses the meter from 8.4.
- **Coming up:** derived from active recurring templates whose `nextRunOn` is within 14 days. Hidden when there are no templates.
- **Recent activity:** the 10 most recent transactions in range from the summary endpoint, grouped by date, each row opens the transaction overlay.
- **Hide amounts:** when active, every amount, balance and chart value becomes a fixed mask (`••••`) with an accessible name "Amount hidden". Charts keep their shapes but axis labels and tooltips are masked. The control is in the header and user menu and is remembered locally.

**Mobile (below 768, single column)**

```
+-----------------------------------+
| Dashboard                 (KM)    |
| [October 2026 v]  {USD v}         |
+-----------------------------------+
| (!) 2 budgets need attention  [>] |
+-----------------------------------+
| Total balance                     |
| $12,480.20                        |
| across 4 wallets                  |
| Income    $4,200.00               |
| Expenses  $3,100.40               |
| Net      +$1,099.60               |
| [=====| day 16 of 31 ==========]  |
+-----------------------------------+
| Wallets   (horizontal scroll rows)|
| Budgets (top 3)     [Manage >]    |
|  Groceries  OVER by $45.20        |
|  [########|--]  $445 of $400      |
| Income and expenses  [Chart|Table]|
|  ~~~ 160px column chart ~~~       |
| Where it went (bars)              |
| Recent activity (5)               |
| Coming up                         |
+-----------------------------------+
| Home | Activity | [ + ] | Budgets | More |
+-----------------------------------+
```

Date range opens a bottom sheet of preset rows (selected one has a check and the word "Selected"), with Custom range at the end.

**First-run dashboard (no wallets)** replaces the Position band with the setup panel from flow 5.4:

```
+-------------------------------------------------------------------------------------------+
| Welcome, Kim. Three quick steps to get your numbers moving.                  1 of 3 done   |
| [=========                     ]                                                            |
|  (1) Create a wallet   Name [ Everyday account ] Type (Bank)(Cash)(Card)(Savings)           |
|                        Currency [USD v]  Opening balance [ 0.00 ]   [Create wallet] [Skip]   |
|  ( ) Add your first expense      (locked until a wallet exists)                             |
|  ( ) Set a monthly budget        (optional)                                                 |
+-------------------------------------------------------------------------------------------+
```

### 6.4 Transactions

> Build-ready detail (routes, URL state, row grid, quick-add, filters, composer modes, error mapping, states) is in [18.3](#183-transactions-list-filters-quick-add-and-full-form-e5-f1-s2). Where 18.3 differs (Load more focus, composer opened by search param, no `density` URL parameter), 18.3 wins.

**Desktop list with quick-add bar and filters**

```
+-------------------------------------------------------------------------------------------------+
| Transactions                                              [Export CSV] [Density: Comfortable v]  |
+-------------------------------------------------------------------------------------------------+
| Quick add  (Expense|Income|Transfer)  [ Amount ] [ Category v ] [ Wallet v ] [ Today ] [ Note ] [Add]|
+-------------------------------------------------------------------------------------------------+
| [Search notes...      ] [Oct 1 - Oct 31 v] [Wallets v] [Categories v] [Type v] [Amount v] [Sort v]|
| Active: [Groceries x] [Checking x] [Expense x]                                    [Clear all]    |
+-------------------------------------------------------------------------------------------------+
| Date      Description                          Wallet          Category              Amount      |
|-------------------------------------------------------------------------------------------------|
| Fri 16 Oct                                                                                       |
|  (cart)  Weekly shop at the market              Checking        Groceries             -$54.20 [..]|
|  (brief) Salary                                 Checking        Salary             +$4,200.00 [..]|
| Thu 15 Oct                                                                                       |
|  (swap)  Transfer to Savings                    Checking        -                     -$200.00 [..]|
|  (swap)  Transfer from Checking                 Savings         -                     +$200.00 [..]|
| ...                                                                                              |
|                                       [ Load more ]      Showing 25 transactions                |
+-------------------------------------------------------------------------------------------------+
```

- **Row anatomy:** category chip (32px, icon on tinted background in the category color), primary line (note, or the category name when there is no note), secondary line on narrow containers (category, wallet, recurring glyph with text label "Recurring" on hover and in the accessible name), amount end aligned in tabular figures. The row is a link to `/transactions/$id`; the overflow menu button (`[..]`) offers Edit, Duplicate (opens the composer prefilled with today's date), Delete.
- **Transfers:** each leg is its own row in its wallet. The chip uses the arrows icon on a neutral background. Title reads "Transfer to {wallet}" or "Transfer from {wallet}". Amounts use `ink-2` with a sign. Editing or deleting either leg opens the transfer form for both legs (the API forbids editing a leg on its own). When any transfer row is in view, the footer says "Transfers aren't counted as income or expenses."
- **Grouping:** by day when sorted by date. Day headers are sticky (z 10). When sorted by amount, no groups.
- **Quick-add bar:** shown from `lg` up when the user has at least one wallet. It is the same form as the full composer in a single row. After a successful add: row inserted at the top with the 1.2s highlight, amount cleared, focus back on amount, `type`, `wallet` and `date` retained. The status line (polite live region) reads "Expense added, $54.20, Groceries."
- **Filters:** the search field matches notes (case-insensitive substring, debounced 300ms). The UI also recognizes typed text that exactly matches a category or wallet name and offers it as a filter chip suggestion ("Filter by category Groceries") since the API's `q` only searches notes. Active filters are removable chips below the bar and each is a real button with an accessible name ("Remove filter: Category Groceries"). Every filter is in the URL.
- **Pagination:** cursor based, so there is no page count. An explicit **Load more** button appends the next page. Focus stays on the button; the live region announces "25 more transactions loaded." Do not use infinite scroll (it traps keyboard users and hides the end of the page). Past about 200 loaded rows, the list is windowed (fixed 56px row height) to keep the DOM small.
- **Loading filters:** when filters change, the previous results stay visible at reduced opacity with `aria-busy="true"` and a thin progress line at the top of the list, then swap. Never blank the table.
- **Export:** "Export CSV" downloads exactly what the filters describe. States: idle, "Preparing export..." (button shows a spinner, `aria-busy`, a Cancel link aborts), success (browser download begins; status "Download started"), 429 ("You can export up to 10 times a minute. Try again shortly."), failure ("The export didn't finish. Try again.") with a retry button.
- **Large desktop (2xl):** master-detail. The list occupies the left 60% and the selected transaction's detail or edit form is a persistent right panel instead of an overlay.

**Mobile list**

```
+-----------------------------------+
| Transactions       [Filters (3)]  |
| [Search notes...             ]    |
| Active: Groceries x  Checking x   |
+-----------------------------------+
| Fri 16 Oct                        |
| (cart) Weekly shop at the m...    |
|        Groceries - Checking       |
|                           -$54.20 |
| (brief) Salary                    |
|        Salary - Checking          |
|                        +$4,200.00 |
|            [ Load more ]          |
+-----------------------------------+
```

"Filters" opens a bottom sheet with all filter controls and a sticky "Show results" button. Tapping a row opens a detail sheet whose actions (Edit, Duplicate, Delete) are visible buttons. There are no swipe-only actions.

**Composer, full form (drawer 440px on desktop, full-height sheet on mobile)**

```
+-----------------------------------------------+
| Add transaction                          [x]   |
| (Expense) (Income) (Transfer)                  |
|                                                |
| Amount                                         |
| $ [ 0.00                    ]  USD (Checking)  |
|                                                |
| Category                                       |
| Recent: [Groceries] [Dining] [Transport] [+3]  |
| [ Search categories...                     v ]  |
|                                                |
| Wallet              Date                       |
| [ Checking       v] [ 16 Oct 2026  ] [Today]   |
|                                                |
| Note (optional)                       0 / 500  |
| [                                           ]  |
|                                                |
| Make this recurring ->                          |
+-----------------------------------------------+
| [Cancel]                       [Add expense]   |
+-----------------------------------------------+
```

- The primary button names the outcome and changes with the type: "Add expense", "Add income", "Move money" for transfer.
- Amount field: text input with `inputmode="decimal"`, no spinner arrows, locale-aware decimal and grouping separators, accepts pasted formatted values, constrained to the currency's exponent (JPY none, USD 2, KWD 3). The currency code shows next to it and comes from the selected wallet. Maximum is validated to the contract's limit.
- Category is a combobox (type to filter, arrow keys, Enter). Recent categories are chips for the selected type, derived from the user's last transactions. Retired system categories are never offered.
- Wallet defaults to the last wallet used. Archived wallets are not listed.
- Date defaults to today in the user's timezone, with a Today shortcut and a native-feeling date picker (typed entry always works).
- Mobile: the amount field is first and largest (28px) and opens the numeric keypad; the category chips are a 4-column grid of 44px targets; the footer button is sticky above the safe-area inset.
- Unsaved changes: closing a dirty form asks "Discard this transaction?" with Keep editing (default focus) and Discard.

**Detail and edit overlay:** same form prefilled, with a header showing the type chip and created and updated dates in `caption` style, and a destructive "Delete" text button at the left of the footer, away from Save. Transfer legs show the transfer form.

### 6.5 Wallets

> Build-ready detail (list and mobile layouts, balance and negative-balance rules with contrast ratios, form, archive, unarchive and delete flows, error mapping) is in [18.1](#181-wallets-e3-f1-s2). The archive text and the sample totals below are corrected there (18.4.3, items 2 to 4).

```
+-------------------------------------------------------------------------------------------------+
| Wallets                                               [Show archived (2) o]        [Create wallet] |
|  Totals   USD $10,480.20   EUR EUR 1,820.00     (never summed across currencies)                  |
+-------------------------------------------------------------------------------------------------+
| Name                       Type        Currency            Balance                                |
|  (bank)    Checking        Bank        USD            $1,180.00    [..]                           |
|  (piggy)   Savings         Savings     USD            $9,200.00    [..]                           |
|  (cash)    Cash            Cash        USD              $100.20    [..]                           |
|  (card)    Visa            Card        USD           -$2,400.00 owed    [..]                      |
|  (bank)    Euro account    Bank        EUR         EUR 1,820.00    [..]                           |
|  Archived (collapsed rows, muted, "Archived" badge): Old savings   Unarchive  Delete              |
+-------------------------------------------------------------------------------------------------+
```

- **Balance display:** the full amount with the wallet's own currency, tabular figures, end aligned. Amounts in a currency other than the user's preference show the code as muted text after the amount, because symbols are ambiguous.
- **Negative balance rule.** Card wallets: a negative balance is normal (money owed). It shows the minus sign in `ink` and the word "owed" in `ink-2`. All other types: a negative balance shows the minus sign, `danger` text and a "Overdrawn" badge with an icon. Never color alone.
- **Row menu:** Edit, Archive (or Unarchive), Delete (only offered when `hasTransactions` is false; otherwise the menu shows "Delete is unavailable. This wallet has transactions. Archive it instead." as disabled text, not a hidden item).
- **Archived rows** are hidden by default (matches the API). With the switch on they appear below, muted, with Unarchive and Delete.
- **Create or edit (dialog 480px, bottom sheet on mobile):**

```
+--------------------------------------------+
| Create wallet                         [x]   |
| Name        [ Everyday account           ]  |
| Type        (Cash) (Bank) (Card) (Savings)  |   4 radio cards with icon + label
| Currency    [ USD - US dollar          v ]  |   locked with explanation when the wallet has transactions
| Opening balance                             |
| [ 0.00 ]   What was in this wallet before   |
|            your first transaction. Use a    |
|            minus sign for money owed.        |
| (edit mode) Opening 1,000.00 + activity 180.00 = Balance 1,180.00  |
| [Cancel]                    [Create wallet]  |
+--------------------------------------------+
```

- Currency lock: when `hasTransactions` is true, the field is read-only with the line "Currency can't change because this wallet has transactions." (explains `WALLET_CURRENCY_LOCKED` before it can happen).
- **Archive confirmation:** "Archive Checking? It will be hidden from lists and can't receive transactions. Its history stays in your reports. 2 recurring transactions that use it will be paused. You can unarchive it later." The recurring count comes from the loaded templates list. Buttons: Cancel, Archive wallet. Reversible, so no typed confirmation.
- **Delete confirmation** (only for wallets with no transactions): "Delete {name}? This can't be undone."
- Errors: `WALLET_NAME_TAKEN` on the name field; `LIMIT_REACHED` as a form-level message ("You've reached the limit of 100 wallets."); `WALLET_IN_USE` on delete (templates exist) as a dialog error with a link to Recurring.

### 6.6 Categories

> Build-ready detail (chip anatomy, CSP-safe color wiring, contrast ratios for all 14 colors, icon and color picker interaction, system versus custom distinction, delete flow) is in [18.2](#182-categories-icons-and-colors-e4-f1-s2). Picker selection uses an `ink` ring and native radio behavior there, which replaces the "primary ring" and roving-tabindex wording below.

```
+-------------------------------------------------------------------------------------------------+
| Categories                                                                  [Create category]   |
+-----------------------------------------------+-------------------------------------------------+
| Expense (24)                                   | Income (8)                                      |
|  Yours                                         |  Yours                                          |
|   (paw)  Pets                       [..]       |   (laptop) Side projects            [..]        |
|   (book) Courses                    [..]       |  Defaults  (lock icon + "Default" text)         |
|  Defaults                                      |   (brief)  Salary                    Default    |
|   (cart) Groceries            lock Default     |   (laptop) Freelance                 Default    |
|   (house) Housing             lock Default     |   ...                                           |
+-----------------------------------------------+-------------------------------------------------+
 Below 1024px the two columns become tabs: (Expense 24) (Income 8) with a roving-tabindex tablist.
```

- **System versus custom:** defaults show a lock glyph and the word "Default" in `ink-3`, have no overflow menu, and open a read-only detail on click (a message "Default categories are managed by the Midas administrator"). User categories show Edit and Delete. A user may create a category with the same name as a default (the contract allows it).
- **Create or edit:** name (1 to 40), type (create only; read-only chips on edit), **icon picker**, **color picker**, and a live preview chip.

```
+--------------------------------------------+
| Create category                        [x]  |
| Preview   (chip)  Pets                       |
| Name      [ Pets                          ]  |
| Type      (Expense) (Income)                 |
| Color     (o)(o)(o)(o)(o)(o)(o)  14 swatches |
| Icon      [ Search icons...                ] |
|           Money   (o)(o)(o)(o)(o)(o)(o)      |
|           Home    (o)(o)(o)(o)(o)(o)(o)      |
|           ...                                |
| [Cancel]                  [Create category]  |
+--------------------------------------------+
```

- **Color picker:** a `radiogroup` of 14 swatches (36px, 44px on touch) in a 7-column grid. Each swatch has an accessible name ("Teal"), the selected one shows a check glyph and a 2px ink ring (not color alone), arrow keys move selection, Tab leaves the group. The first suggested color for a new category is the next unused one from the validated 8-color order (section 13.3).
- **Icon picker:** a search field filters a grouped grid of 70 icons (groups in 13.4). The grid is a `radiogroup` with roving tabindex, arrow keys across and down, 40px cells, selected shows the primary ring and a check. The search matches the icon label and a keyword list. Unknown stored keys render the fallback `tag` icon on `slate`.
- **Delete flow:** (1) confirm dialog "Delete Pets?" with Cancel and Delete category. (2) The client calls DELETE. If it is unused the request succeeds: toast "Category deleted." (3) On `CATEGORY_IN_USE` the same dialog switches to a reassign step: "Some transactions, recurring transactions or budgets use Pets. Choose a category to move them to." with a combobox of same-type, non-retired categories (excluding itself) and the consequence line "Budgets for Pets will be deleted." Button: "Delete and reassign". Success toast reports the three counts returned: "Moved 42 transactions and 1 recurring transaction. Deleted 1 budget." (`REASSIGN_TARGET_INVALID` shows on the combobox.) See DN-2 for showing counts before the user commits.

### 6.7 Budgets

```
+-------------------------------------------------------------------------------------------------+
| Budgets                      [<] October 2026 [>] [Today]     ( All | Monthly | Weekly | Yearly )  [Create budget] |
+-------------------------------------------------------------------------------------------------+
| Needs attention (2)                                                                              |
|  (cart) Groceries                                   OVER   [x] Over by $45.20                    |
|  [##############################|#### (hatched overflow)]                                        |
|  $445.20 spent of $400.00 limit     Monthly                                    [..]              |
|                                                                                                  |
|  (fork) Dining out                                  NEAR   [!] Near limit - 85% used             |
|  [#########################|------]    $255.00 of $300.00 - $45.00 left - 13 days to go         |
| On track (3)                                                                                     |
|  Overall   [###########|--------------]  $3,100.40 of $4,000.00                                  |
|  (bus) Transport  [####|--------]  ...                                                          |
+-------------------------------------------------------------------------------------------------+
```

- **Grouping:** "Needs attention" (exceeded first, then warning), then "On track". The Overall budget for each currency is pinned at the top of its group with a taller meter.
- **State is never color alone.** Each row carries an icon, a text label and the numbers. `ok`: check icon, "On track". `warning`: triangle-alert icon, "Near limit" with the percent. `exceeded`: octagon-x icon, "Over by {amount}", and the part of the meter beyond 100% is drawn with a 45 degree hatch texture.
- **Meter spec:** see 8.4. The pace notch (brass) shows elapsed time within the period.
- **Period navigation:** the arrows move by one month for All and Monthly, one ISO week for Weekly and one year for Yearly. Each row shows its own period label ("Week of 12 Oct", "Oct 2026", "2026") because the selected date drives all rows. A budget that starts after the viewed period (`status` is null) is shown as "Starts {date}" with an empty meter.
- **Create or edit form (dialog 520px):**

```
+--------------------------------------------------+
| Create budget                               [x]   |
| Applies to  (Everything) (One category)           |
| Category    [ Groceries                         v]|   expense categories only; ones with a budget are disabled
| Repeats     [ Monthly v ]                         |
| Limit       $ [ 400.00 ]  USD                     |
| Warn me at  [ 80 ]%  ---o------------------       |   1 to 99, default 80
| Preview     [####################|----]  80% = $320.00 and over shows "Near limit"        |
| (advanced)  Starts: current period                |
| [Cancel]                          [Create budget] |
+--------------------------------------------------+
```

  Slider and number input are bound; the slider has a text value and `aria-valuetext` ("80 percent, $320.00"). The preview meter shows where the warning begins and where the pace notch sits right now.
- **Edit lock:** scope, category, period and currency are read-only text with the explanation shown in flow 5.8.
- **Announcements:** see 6.9.

### 6.8 Recurring

```
+-------------------------------------------------------------------------------------------------+
| Recurring                                                    ( All | Active | Paused | Ended )  [Create recurring] |
+-------------------------------------------------------------------------------------------------+
| Needs attention (1)                                                                              |
|  [!] Gym      Paused after 5 failed attempts: the category was retired.   [Choose category] [Resume] |
+-------------------------------------------------------------------------------------------------+
| Name        Schedule                 Next          Amount        Wallet      Status         |
|  Rent       Monthly on the 1st       1 Nov      -$1,200.00      Checking    (check) Active  [Pause] [..] |
|  Salary     Monthly on the 28th      28 Oct     +$4,200.00      Checking    (check) Active  [Pause] [..] |
|  Phone      Every 2 months on the 30th  30 Oct     -$40.00      Visa        (pause) Paused  [Resume] [..]|
|  Old plan   Weekly on Friday         -          -$10.00         Cash        (flag) Ended    [..]        |
+-------------------------------------------------------------------------------------------------+
```

- **Schedule text** is generated from frequency, interval and start date ("Every 2 weeks on Friday", "Monthly on the 31st (last day in short months)").
- **Status** is icon plus text. Paused and ended rows are muted but fully legible.
- **Form** (dialog 560px, sheet on mobile) uses the layout from flow 5.9 with the live "Next dates" list beside the schedule on desktop and below it on mobile. Dates that were moved by month-end clamping carry an info icon and a legend line.
- **Run history drawer:** table of occurrence date, outcome (Added, Failed, Skipped with icon and text), attempts, and a link to the generated transaction. Cursor-paged with Load more. Error codes are translated to a human sentence ("The wallet was archived").
- On mobile each template is a two-line list item (name and amount, then schedule and next date) with the actions in a sheet.

### 6.9 Budget warnings (cross-screen)

- **Badges:** On the Budgets list and Dashboard widget, the state badge is a text label with an icon (see 6.7). Warning uses `warning` text on `warning-tint`. Exceeded uses `danger` text on `danger-tint`.
- **Dashboard attention strip:** lists budgets that are exceeded or in warning, with the numbers. It is a `region` labeled "Needs attention". It does not use `role="alert"` on page load.
- **Announcements:** after the dashboard or budgets data loads, a visually hidden polite live region states the summary once ("2 budgets need attention: Groceries is over its limit, Dining is near its limit."). After adding or editing a transaction, the client refetches budgets, compares states before and after, and if a budget moved into warning or exceeded shows a status toast ("Dining is now at 85% of its monthly budget.") with a View budget action. Toasts that carry information are `role="status"` and stay for at least 8 seconds, longer if they contain an action. Exceeded budgets are also visible persistently in the attention strip, so the toast is never the only record.

### 6.10 Reports

```
+-------------------------------------------------------------------------------------------------+
| Reports                [Oct 1, 2026 - Oct 31, 2026 v]  Currency [USD v]  Group by [Auto v]          |
+-------------------------------------------------------------------------------------------------+
| Income $4,200.00  -  Expenses $3,100.40  =  Net +$1,099.60        You kept 26% of your income    |
+-------------------------------------------------------------------------------------------------+
| Income and expenses by week                       [Chart | Table]                                |
|  ~~~ clustered columns (<= 36 buckets) or lines (more), net line ~~~                              |
+-------------------------------------------------------------------------------------------------+
| Where it went   (Expenses | Income)                                      [Chart | Table]        |
|  ranked bars with amount and percent; "Other (5 categories)" last; Total and "Transfers excluded" |
+-------------------------------------------------------------------------------------------------+
| Want the raw rows?  Export transactions for this range (CSV)                                     |
+-------------------------------------------------------------------------------------------------+
```

The "You kept 26% of your income" sentence is derived (`net / income`, integer math, hidden when income is zero or net is negative, in which case the sentence reads "You spent more than you earned this period."). Mobile stacks everything in one column; the range control is a sheet.

### 6.11 Settings

Single column (720px), a left sub-navigation on desktop (tabs on mobile) for Profile, Preferences, Security.

```
Profile                                    Preferences
  Display name [ Kim Morgan        ]         Theme       (Light)(Dark)(System)   <- applies immediately
  Email        kim@example.com (read-only)   Currency    [ USD v ]
               Email changes aren't          Language & number format [ English (United States) v ]
               supported yet.                Time zone   [ America/New_York v ]
  [Save changes]                             Sample:  $1,234.56 - 16 Oct 2026 - 1,234.5
                                             "Currency only sets defaults for new wallets and budgets. Existing
                                              data keeps its currency."        [Save changes]

Security
  Change password
  Current password [          ] [Show]
  New password     [          ] [Show]   {strength meter}
  "Other devices will be signed out. You'll stay signed in here."   [Update password]
  Session   [Sign out]
```

- Each section has its own Save button, enabled only when dirty, with a "Saved" status that remains for 5 seconds.
- Theme is the exception: it applies and saves immediately (optimistic), with a status "Theme set to Dark".
- The sample line updates live as currency, locale or timezone changes, so the effect is visible before saving.
- `INVALID_CURRENT_PASSWORD` shows on the current password field. `SAME_AS_CURRENT` and `WEAK_PASSWORD` show on the new password field.

### 6.12 Admin

Admin pages use compact density, the brass header edge and the privacy line. All admin tables are real tables with sticky headers and sortable column headers where the API supports sorting.

**Overview**

```
+-------------------------------------------------------------------------------------------------+
| Administration > Overview                                         Updated 3 minutes ago          |
| Admin tools show account status and platform totals only. They never show anyone's transactions.  |
+-------------------------------------------------------------------------------------------------+
| Accounts                                              | Activity                                  |
|  Total accounts            1,204                      |  Wallets            3,810  (3,402 active) |
|  Active in last 30 days      812  [=========|----] 67%|                      [========|-] 89%     |
|  New in last 30 days          58                      |  Transactions     412,330                 |
|  Suspended                     4                      |   added in last 30 days 38,904            |
|  Administrators                3                      |  Active recurring items      1,147        |
+-------------------------------------------------------------------------------------------------+
```

Counts are shown as a definition list with proportion bars only where a part-to-whole exists (active of total). There are no trend lines because the API returns a single snapshot (see DN-7). Values use tabular figures and a text label, never icons alone.

**Users**

```
+-------------------------------------------------------------------------------------------------+
| Users          [Search name or email...   ] [Role v] [Status v] [Sort: Newest v]                |
+-------------------------------------------------------------------------------------------------+
| User                          Role    Status       Joined       Last sign-in     Actions         |
|  Kim Morgan                   Admin   (check) Active  3 Mar 2026   16 Oct, 08:30    [..]  (You)  |
|  kim@example.com                                                                                 |
|  Lee Park                     User    (ban) Suspended 9 Jun 2026   2 Sep, 19:12    [..]          |
|  lee@example.com                                                                                 |
+-------------------------------------------------------------------------------------------------+
| Showing 1-25 of 1,204            Rows per page [25 v]      < 1 2 3 ... 49 >                       |
+-------------------------------------------------------------------------------------------------+

User detail drawer (opens from a row)                                       Suspend dialog
  Lee Park  [Suspended]                                                       Suspend Lee Park?
  lee@example.com                                                             - They will be signed out on every device now.
  Joined 9 Jun 2026   Last sign-in 2 Sep 2026   Active sessions 0             - They can't sign in until you reactivate them.
  Suspended 2 Sep 2026: "Repeated abuse reports"                              - Their data is not changed and you can't see it.
  Role  [User v]   [Reactivate]   View audit trail >                          Reason (optional) [                ] 0 / 500
                                                                              [Cancel]            [Suspend account]
```

- Search is debounced 300ms and keeps the cursor and filters in the URL. Results region is `aria-live="polite"` with the count.
- The row for the current admin is labeled "You" and its role and suspend controls are disabled with visible helper text ("You can't change your own role or status.") rather than a hover-only hint (`CANNOT_MODIFY_SELF`). `LAST_ADMIN` returns as an inline dialog error: "There must be at least one active administrator."
- Role change dialog: "Make Lee Park an administrator? Administrators can manage accounts, default categories and see the audit log. They still cannot see anyone's transactions." Buttons: Cancel, Make administrator. Demotion: "Remove administrator access from ...?"
- Long names and emails truncate with an ellipsis, with the full value in a `title` and in the drawer. Email is never rendered as HTML.
- Suspension reason is plain text, rendered escaped.

**Default categories**

```
| Default categories      ( Expense | Income )   [x] Show retired                  [Create category]|
| Icon  Name                  Color   Status      Updated        Actions                          |
| (cart) Groceries            green   Active      3 Mar 2026     [Edit] [Retire]                  |
| (gift) Gifts received       pink    Retired     9 Jun 2026     [Edit] [Restore]                 |
```

Retire dialog: "Retire Gifts received? Existing transactions, budgets and recurring items keep it. People can't choose it for new ones. You can restore it later." `CATEGORY_NAME_TAKEN` on restore: "An active default category already has this name. Rename one of them first."

**Audit log**

```
| Audit log                                                                 Entries are kept for 400 days. |
| [Actor email     ] [Action: any v] [Target type v] [Target: user 1a2b... x] [Date: UTC  1 Oct - 16 Oct v] |
+-------------------------------------------------------------------------------------------------+
| Time (UTC)            Actor              Action                         Target         Request    |
|  2026-10-16 08:30:12  kim@example.com    User suspended  admin.user_suspended  user 7c1e..  [copy] |
|  2026-10-16 08:12:40  System             Admin bootstrapped  system.admin_bootstrapped  -          |
|  v expanded: IP 203.0.113.9  Agent: Mozilla/5.0 ...   Metadata: reason = "Repeated abuse reports"   |
|                                       [ Load more ]                                               |
+-------------------------------------------------------------------------------------------------+
```

- Times are shown in UTC with a visible "UTC" label because audit timestamps must be unambiguous; the local time is available on focus/hover in a tooltip that is also reachable by keyboard and not required to read the row.
- The human action label is primary; the raw code is muted in the mono style so operators can search it. Rows expand with a disclosure button (`aria-expanded`) to show IP, user agent and metadata as key-value text.
- Anonymous or system actors show "System" or "Anonymous" in `ink-3`.
- Date filters are inclusive UTC days and are labeled so.
- No row action can edit or delete an entry, and the UI offers no such control.

---

## 7. Component inventory and structure

Components are owned, Radix-based primitives styled with tokens (shadcn-style), with feature components composed from them. Prefer native semantics (button, a, table, form, label, fieldset) wherever they work.

### 7.1 Primitives (`components/ui`)

| Component | Radix or native | Variants and notes |
| --- | --- | --- |
| `Button` | native | primary, secondary (outline), ghost, danger, link. Sizes sm (32), md (40), lg (44 touch). Loading shows a spinner and `aria-busy`, width stays fixed |
| `IconButton` | native | Always has an accessible name and a tooltip. 32 or 44px |
| `Link` | native `a` with router | Underlined in body text. Never a button lookalike for actions |
| `TextField`, `Textarea` | native | Persistent label above, helper text, error text linked with `aria-describedby`, optional character counter, prefix and suffix slots |
| `PasswordField` | native | Show/hide toggle button (`aria-pressed`), strength meter slot, `autocomplete` per context |
| `MoneyField` | native text | Locale-aware, `inputmode="decimal"`, exponent-limited, currency adornment, sign handling for opening balance. Emits integer minor units |
| `DateField` | native with a Radix Popover calendar | Typed entry always works, Today shortcut, min and max, week starts per locale |
| `Select` | Native `select` | Short option lists (period, frequency, sort). Radix Select is not used: it mounts `react-remove-scroll`, which injects a `<style>` and is blocked by the strict CSP (see 18.0.1) |
| `Combobox` | Radix Popover + cmdk-style list | Searchable lists (category, wallet, currency, timezone). Follows the ARIA combobox pattern (`aria-activedescendant`, `aria-expanded`) |
| `Checkbox`, `RadioGroup`, `Switch` | Radix | Switch is for immediate settings (archived toggle, hide amounts). Checkbox for form agreement |
| `Segmented` | Native radio group (`fieldset`, visually hidden inputs, styled labels) | Transaction type, chart/table, expense/income. Real radio semantics, no JS roving code (18.0.1) |
| `Tabs` | Radix Tabs | Category type on small screens, settings sections |
| `Dialog`, `AlertDialog` | Radix | Dialog for forms. AlertDialog for destructive confirmation (focus starts on the safe action) |
| `Drawer` / `Sheet` | Radix Dialog | Side drawer (desktop) and bottom or full-height sheet (mobile). Focus trap, Esc, scroll lock |
| `Popover`, `DropdownMenu`, `Tooltip` | Radix | Tooltips are supplementary only: no essential info, shown on focus and hover, dismissible with Esc, hoverable |
| `Toast` | Radix Toast | `role="status"` for information, `role="alert"` only for failures. Stack of at most 3. Never the only record of an outcome that needs action |
| `Alert` | native | info, success, warning, danger. Always icon plus text. Inline, persistent |
| `Badge` | native | neutral, success, warning, danger, info. Icon and text |
| `Avatar` | Radix | Initials fallback, `aria-hidden` when the name is adjacent |
| `Skeleton` | native | Matches final geometry to avoid layout shift. `aria-hidden`, with the parent `aria-busy` |
| `Spinner` | native | Used for local actions only, with a text equivalent |
| `ProgressBar` / `Meter` | native `meter` or SVG | Value and text always exposed (8.4) |
| `Table` | native `table` | Sticky header, sortable header buttons (`aria-sort`), row selection not needed in v1, density prop |
| `Pagination` | native `nav` | Numbered (admin users) and Load more (cursor lists) |
| `Breadcrumb` | native `nav` | `aria-current="page"` on the last item |
| `Chip` / `FilterChip` | native `button` | Removable chips with accessible name including the filter |
| `EmptyState` | native | Title, one sentence, primary action, optional secondary link. No decorative illustration required |
| `Kbd` | native | Shows shortcut hints (Ctrl K) |

### 7.2 Domain components (`components/domain` or inside each feature)

| Component | Purpose and rules |
| --- | --- |
| `Amount` | The single source of money display. Props: minor units, currency, sign mode (`auto`, `always`, `never`), tone (`ink`, `income`, `muted`), size. Handles locale, exponent, true minus, tabular figures, `dir="ltr"` isolation, masking when "Hide amounts" is on, and the currency code suffix when the currency differs from the preference |
| `CategoryChip` | Icon on a tinted rounded square (14% color in light, 20% in dark) with the icon stroke in the category color. Name optional. Unknown icon or color falls back to `tag` on `slate` |
| `WalletTypeIcon` | Bank (landmark), cash (banknote), card (credit-card), savings (piggy-bank) |
| `TransactionRow` | Ledger row (6.4). Variants: list, compact, recent-activity |
| `TransferRow` | Transaction row specialization for transfer legs |
| `BudgetMeter` | Meter with state, pace notch and labels (8.4) |
| `StateBadge` | Budget state: On track, Near limit, Over |
| `PeriodStrip` | Elapsed-time track for the dashboard |
| `DateRangePicker` | Presets list, custom range, previous and next arrows, validation (max 1830 days) |
| `FilterBar` | Search, multi-select filters, active chips, clear all, URL sync |
| `CurrencySwitch` | Segmented control of currency codes |
| `Composer` | Transaction and transfer forms in drawer, sheet, inline and panel forms |
| `IconPicker`, `ColorPicker` | See 6.6 |
| `ChartPanel` | Panel with title, chart/table switch, legend and the table alternative |
| `TrendChart`, `BreakdownBars` | Chart components (section 8) |
| `PasswordStrength` | Meter plus text rating plus hints, lazy-loaded |
| `ConfirmDialog` | Standard destructive confirmation: title, consequences list, reversible note, safe action first |
| `ApiErrorAlert` | Maps Problem Details to a message, shows the request id as a copyable reference for 5xx |
| `CommandPalette` | Ctrl or Cmd + K |
| `AttentionStrip` | Dashboard attention items |
| `RecurringScheduleSummary`, `NextDatesPreview` | Schedule text and live preview list |
| `AdminUserTable`, `AuditTable`, `MetricsList` | Admin screens |

### 7.3 State matrix

Every interactive component implements: default, hover, focus-visible, active/pressed, selected (where relevant), disabled, loading, error, and success where an outcome is confirmed.

| State | Visual rule |
| --- | --- |
| Hover | Background steps one level (`surface` to `sunken` tint). Never the only cue of interactivity |
| Focus-visible | 2px `ink` ring, 2px offset. Always visible. Inputs also thicken the border to `ink` |
| Active | 1px translate down, or fill darkens one step. 80ms |
| Selected | `primary-tint` background plus a check glyph or 3px primary edge, plus `aria-selected`/`aria-checked`/`aria-current` |
| Disabled | `ink-3` text, `sunken` fill, `aria-disabled` (buttons that explain something stay focusable). Disabled controls always have visible reasoning nearby when the reason is not obvious |
| Loading | Spinner replaces the leading icon, label stays, width stays, `aria-busy="true"`, repeat activation ignored |
| Error | 1px `danger` border and a `danger` message with an icon below the field, linked by `aria-describedby`, `aria-invalid="true"` |
| Success | Inline "Saved" status with a check icon (not color alone) that fades after 5s. No success toast for something the user can see changed |

### 7.4 Frontend structure mapping (for E1-F2-S2 and feature stories)

```
apps/web/src/
  styles/            tokens.css (light/dark), tailwind entry, fonts.css, print/forced-colors rules
  components/ui/     primitives in 7.1
  components/domain/ Amount, CategoryChip, BudgetMeter, DateRangePicker, FilterBar, ...
  components/charts/ TrendChart, BreakdownBars, ChartPanel, chart-tokens
  app/               providers (query, theme, auth, privacy), shell (rail, header, bottom bar), command palette
  features/<name>/   api.ts, hooks.ts, components/, strings.ts (all UI strings for the feature, per architecture R15)
  lib/               money, dates, url-state, focus management, live-region announcer
```

Server state belongs to TanStack Query (keys per resource, invalidation lists in 7.5). UI state that matters across reloads goes in the URL. Purely personal UI preferences (density, hide amounts, dismissed onboarding) go in local storage keyed by user id. Nothing financial is cached in local storage.

### 7.5 Cache invalidation after mutations

| Mutation | Invalidate |
| --- | --- |
| Create, edit or delete transaction or transfer | transactions, wallets, reports (summary, trend, breakdown), budgets |
| Archive or unarchive wallet | wallets, recurring, transactions (if archived shown), reports |
| Create, edit or delete category | categories, transactions, budgets, recurring |
| Budget create, edit, delete | budgets, reports.summary |
| Template changes | recurring, wallets (none), and reports only after a generated run |
| Preferences change | me, and everything that formats or defaults from it |

---

## 8. Data visualization guidance

Charts exist to answer a question. There are four in the product, plus the meters.

| Question | Form | Where |
| --- | --- | --- |
| Am I earning more than I spend over time? | Clustered columns (income, expenses) with a net line on the same axis. Lines instead of columns above 36 buckets | Dashboard, Reports |
| Where did the money go? | Ranked horizontal bars | Dashboard, Reports |
| Am I inside my plan? | Meter with state and pace notch | Budgets, Dashboard |
| What is the platform doing? | Definition list with proportion bars for part-to-whole | Admin overview |

No dual axes, no pie or donut, no 3D, no gradient fills, no smoothing of the net line. Totals that need a precise value are shown as numbers, not as charts.

### 8.1 Color roles

- **Series (income, expenses, net):** `series-income`, `series-expense`, `series-net` (section 3.1). They validate as a pair on both surfaces (normal-vision difference ΔE 21.4 light and 18.2 dark, all within the lightness band, at least 3:1 against the surface). Because the blue/green pair is separated by hue and not strongly by lightness for tritan vision, position and labels are the secondary channel: income is always the left column of each pair and expense the right, both are named in the legend and in the table.
- **Categories in the breakdown:** each bar uses its category's own color (color follows the entity, so Groceries is the same green everywhere). Bars are always labeled with the category name and value, so identity never depends on color. "Other" uses `series-other`.
- **Status colors** (`danger`, `warning`, `income`) are reserved for state text, badges and meters. They are not reused as series colors.
- Text near charts always uses `ink`, `ink-2` or `ink-3`, never the series color.

### 8.2 Marks and anatomy

| Element | Spec |
| --- | --- |
| Columns / bars | At most 24px thick, 4px rounded data end, square at the baseline, 2px surface-colored gap between touching marks |
| Lines | 2px, round joins, no smoothing |
| Markers | 8px minimum diameter with a 2px surface ring |
| Grid and axes | Hairline (1px) solid in `grid` and `axis`, recessive. Gridlines horizontal only |
| Axis ticks | Clean round numbers, compact from 1,000 (1K, 2.5K, 1M), tabular figures, `caption` size |
| Zero baseline | Always present. Net can go below zero, and the axis shows it with a clear baseline |
| Labels | Direct labels on the one thing the story is about (largest category value, last net point). Never a number on every point. Values for everything else are in the tooltip and the table view |
| Legend | Always present for two or more series, in a row above the plot, with a swatch (not colored text). Not needed for a single series |
| Area fills | None in v1 |

### 8.3 Interaction

- **Hover and focus:** a crosshair and tooltip on the trend chart, a per-bar tooltip on bars. Hit targets are larger than the marks (full bucket column width, full bar row). The tooltip shows the period, each series value formatted with `Amount`, and the net.
- **Keyboard:** the chart container is focusable. Arrow keys move between buckets (or bars) and update the same readout as the tooltip, shown in a visible, persistent caption under the chart ("Week of 12 Oct. Income $1,050.00. Expenses $812.40. Net +$237.60.") that is also a polite live region. Esc dismisses. If the chart library's built-in accessibility layer provides equivalent behavior, use it, otherwise implement this readout.
- **Touch:** tap shows the readout. No pinch or drag-only interactions. Drill-down is a tap on a breakdown bar.
- **Table view:** every chart has a Chart | Table switch directly in the panel header. The table is a real `table` with caption, `th scope`, tabular figures, and the same data. The chart itself is `role="img"` with an `aria-label` summarizing the period and totals, and `aria-describedby` pointing at the table or readout.
- **Loading:** a skeleton with the chart's real height and axis placeholders. **Empty data:** a flat zero baseline with the message "No income or expenses in this range." and a link to widen the range, not an empty rectangle. **Single bucket:** show one pair of columns with direct labels.
- **Hide amounts:** axis labels and tooltips are masked; shapes stay.
- **Reduced motion:** no entry animation. Marks render in their final state.
- **CSP:** the app serves a strict `style-src 'self'`. Chart and meter implementations must not rely on inline `style=""` attributes written into markup. Use SVG attributes or the DOM style API through the framework (React's `style` prop works under the CSP because it sets styles through the DOM). Verify in E10-F1-S2.

### 8.4 Budget meter and period strip

| Part | Spec |
| --- | --- |
| Track | 8px tall (12px for Overall), 4px radius, a lighter tint of the fill's own hue so state reads across the whole bar |
| Fill | `income` pine when OK, `warning-mark` for warning, `danger` for exceeded. Width is `min(percentUsed, 100)%` |
| Overflow (exceeded) | The portion past 100% is drawn as a continuation bar clipped at the track's right end with a 45 degree hatch texture, plus the text "Over by $45.20" |
| Pace notch | 2px by 16px brass tick at the elapsed-time percentage of the period (`today − periodStart + 1` over days in period). Has `aria-hidden`, and the same information is in text ("13 days to go") |
| Text | Left: spent of limit. Right: remaining (or over by), state label. Tabular figures. Percent in the state label for warning |
| Semantics | A native `meter` element or an SVG with `role="meter"`, `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax` (limit), `aria-valuetext` ("$320 of $400, 80 percent, near limit") |
| Animation | The fill animates (`motion-meter`) only when the value changes while the user is on the page |

### 8.5 Breakdown bars

Rows sorted by amount descending. Each row: category chip, name, bar, value, percent. The percentages are the API's, which sum to exactly 100.00 across items and Other. Display percentages with no decimals unless a value is below 1%, which displays as "<1%". If rounded displays do not sum to 100, still show the API's rounded values (the contract guarantees the sum at two decimals; the UI must not re-round away from them in the table view). A row is a link to the filtered transaction list. The bottom line reads "Total {amount}. Transfers excluded."

### 8.6 Number formats in charts

Currency amounts use the shared formatter with the report currency, compact on axes, full precision in tooltips and tables. Percentages use one decimal in meters only when needed. Dates on axes: day buckets "16 Oct", week buckets "12 Oct" with the full "Week of 12 Oct" in the readout, month buckets "Oct" with the year added when the range crosses years.

---

## 9. Responsive behavior

Responsive design here changes structure, not only size. The strategy is mobile-first for capture and desktop-first for review.

| Concern | Mobile (< 768) | Tablet (768 to 1023) | Desktop (1024+) | Large (1536+) |
| --- | --- | --- | --- | --- |
| Navigation | Bottom bar (Home, Activity, Add, Budgets, More). More is a sheet | 64px icon rail with an expand control | 232px rail | Same |
| Header | Page title and avatar. Search in the palette via the More sheet | Title, Add, user menu | Title, Hide amounts, search, Add, user menu | Same |
| Dashboard | One column in the order in 6.3 | Two columns: Position full width, then pairs | 12-column layout in 6.3 | Max width 1440, more breathing room, no new content |
| Transactions | Two-line list, filter sheet, detail sheet | Table without the Wallet column (wallet moves into the second line), drawer | Full table, quick-add bar, drawer | Master-detail with persistent panel |
| Forms | Full-height sheet, sticky action bar above the safe area, one column | Dialog or drawer | Dialog or drawer, paired fields allowed | Same |
| Tables (admin) | Stacked list of rows with the key fields and an actions sheet | Table with horizontal scroll container, sticky first column | Full table | Same |
| Charts | 160 to 200px high, fewer ticks, readout under the chart, table switch | 240px | 280 to 320px | Same |
| Date range | Bottom sheet of presets | Popover | Popover with presets on the left and calendar on the right | Same |
| Density | Comfortable only | Comfortable | Comfortable (user) or compact (admin) | Same |

Rules:

- **Container queries over viewport queries** for rows, panels and charts, because the available width changes with the rail and with side panels. The transaction row switches from "one line with columns" to "two-line stack" when its container is under 720px.
- **No horizontal scrolling of the page** at 320 CSS px and at 400% zoom (WCAG reflow). Only data tables in the admin area may scroll horizontally inside their own labeled container (which is a keyboard-focusable region), and on mobile they switch to the stacked layout instead.
- **Thumb reach:** on phones the primary action (Add, form submit) sits in the bottom 40% of the screen. Destructive actions sit away from the primary one.
- **Safe areas:** the bottom bar and sticky action bars add `env(safe-area-inset-bottom)` padding. Viewport units for sheets use dynamic viewport height so the on-screen keyboard does not hide the submit button.
- **Orientation:** no lock. Landscape phones keep the bottom bar but reduce its height to 48px.
- **Keyboard on mobile:** numeric keypad for amounts (`inputmode="decimal"`), email keyboard for email, `enterkeyhint="done"` on the last field of a form and "next" elsewhere.
- **Input modes:** pointer coarse switches control height to 44px and target spacing to at least 8px. Hover-only affordances do not exist, every hover reveal has a focus and tap equivalent.
- **Large screens:** content stops growing at 1280 (1440 for the dashboard). The extra space is used for master-detail, not stretched tables.
- **Print:** not a v1 goal. A reports page prints reasonably because chart tables exist, but no print stylesheet is required.

---

## 10. Accessibility (WCAG 2.1 AA)

Target: WCAG 2.1 AA for the whole product, with a few 2.2 behaviors adopted early because they are cheap (target size, focus not obscured). Automated checks (axe in component tests and Playwright, E10-F2-S3) are necessary but not sufficient. The manual checklist in `docs/qa/` covers the rest.

### 10.1 Success criteria and where they are met

| SC | Requirement | Design response |
| --- | --- | --- |
| 1.1.1 Non-text content | Text alternatives | Icons that carry meaning have text beside them or an `aria-label`. Decorative icons and the auth ledger specimen are `aria-hidden`. Charts are `role="img"` with a summary and a table alternative |
| 1.3.1 Info and relationships | Structure in markup | Real headings, lists, tables with `th scope`, `fieldset` and `legend` for radio groups, labels bound to inputs, landmarks (`header`, `nav`, `main`) |
| 1.3.2 Meaningful sequence | DOM order matches visual order | Mobile order and desktop order differ only in layout, never by CSS reordering that breaks reading order of interactive content |
| 1.3.4 Orientation | No lock | None |
| 1.3.5 Identify input purpose | Autocomplete | `autocomplete` tokens on auth and profile fields (15.3) |
| 1.4.1 Use of color | Color is never the only signal | Income and expense use sign and text. Budget state uses icon, label and hatch. Charts have labels, legend and table. Selected uses a check or edge as well as tint |
| 1.4.3 Contrast (minimum) | 4.5:1 text, 3:1 large | All text tokens at 4.5:1 or better in both themes (3.1). Text on tinted backgrounds checked at 5.2:1 or better |
| 1.4.4 Resize text | 200% | Layout uses rem and flexible containers. Nothing is clipped at 200% zoom |
| 1.4.10 Reflow | 320 CSS px without 2D scroll | Section 9 |
| 1.4.11 Non-text contrast | 3:1 for UI components and graphics | `line-strong` on inputs is 3.6 and 3.7:1. Category colors on their tint chips are 3.4:1 or better. Chart marks are at least 3:1. Focus ring is above 14:1 |
| 1.4.12 Text spacing | Overrides do not break layout | No fixed-height text containers. Truncation uses CSS ellipsis with the full text available elsewhere |
| 1.4.13 Content on hover or focus | Dismissible, hoverable, persistent | Tooltips and popovers close with Esc, stay while hovered, and are never the only place for essential content |
| 2.1.1 Keyboard | Everything operable | Native controls where possible. Custom widgets follow ARIA authoring patterns (10.3) |
| 2.1.2 No keyboard trap | | Dialogs and sheets trap focus only while modal and always close with Esc |
| 2.1.4 Character key shortcuts | No single-key shortcuts | Only modifier shortcuts (Ctrl/Cmd + K, Ctrl/Cmd + Enter). No bare letter shortcuts |
| 2.2.1 Timing adjustable | | No time limits on forms. Toasts last at least 8 seconds and pause on hover and focus. The rate-limit countdown is informational |
| 2.2.2 Pause, stop, hide | | No auto-updating or looping content. The row highlight lasts 1.2 seconds and respects reduced motion |
| 2.3.1 Three flashes | | None |
| 2.4.1 Bypass blocks | | Skip to main content link |
| 2.4.2 Page titled | | `document.title` updates on every route: "Transactions - Midas" |
| 2.4.3 Focus order | | DOM order is the logical order. Overlays return focus to their trigger on close |
| 2.4.4 Link purpose | | Link text states its destination ("View budgets", "Request a new link"). No "click here" |
| 2.4.6 Headings and labels | | One `h1` per route, sequential levels, descriptive labels |
| 2.4.7 Focus visible | | 2px ink ring everywhere (3.1) |
| 2.5.1 Pointer gestures | Single-pointer alternatives | No swipe-only or drag-only actions |
| 2.5.3 Label in name | | Visible label text is included in the accessible name |
| 2.5.4 Motion actuation | | None used |
| 3.1.1 Language of page | | `lang` set from the user's locale preference, `dir` for RTL locales |
| 3.2.1, 3.2.2 On focus, on input | No unexpected context change | Filters apply when changed within the same page and announce results. Nothing navigates on select without a button. Theme change is immediate but stays on the page |
| 3.3.1 Error identification | | Field errors are text, linked to fields. A form-level summary appears for forms over 5 fields |
| 3.3.2 Labels or instructions | | Persistent visible labels. Format hints ("12 or more characters") appear before the user types, not only after an error |
| 3.3.3 Error suggestion | | Messages say what to do ("Use 12 or more characters") |
| 3.3.4 Error prevention (legal, financial) | Reversible, checked or confirmed | Deletes and archives are confirmed with consequences. Transfers preview the resulting balances. Edits are reversible by editing back |
| 4.1.2 Name, role, value | | Custom components expose names, roles, states. Meters expose value text |
| 4.1.3 Status messages | | Polite live region for results counts, saves, additions. Assertive only for failures that block the task |

### 10.2 Focus and route changes

- On route change, focus moves to the new page's `h1` (`tabindex="-1"`), the title updates, and the live region announces "{Page}" once.
- Opening an overlay moves focus to its first focusable control (the safe action for confirmations). Closing returns focus to the element that opened it, or to the page `h1` if that element no longer exists (for example a deleted row).
- After a successful inline add, focus returns to the amount field. After deleting a row, focus goes to the next row, or the previous one, or the list heading.
- Focus is never hidden under sticky headers or the bottom bar (scroll padding equals the header height).

### 10.3 Keyboard maps

| Widget | Keys |
| --- | --- |
| Combobox | Down/Up open and move, type to filter, Enter selects, Esc closes and keeps the typed text, Home/End jump |
| Segmented, tabs | Left/Right (and Home/End) move, Space/Enter select. Roving tabindex, one tab stop |
| Color and icon picker | Arrow keys move within the group, Space/Enter select. One tab stop for the group |
| Menu | Down/Up, Enter, Esc, type-ahead |
| Dialog and sheet | Tab cycles inside, Esc closes (with discard confirmation if dirty), Enter submits a form unless focus is on a button |
| Table | Tab to row links and buttons. Sortable headers are buttons with `aria-sort`. Row expand buttons use `aria-expanded` |
| Date range picker | Arrow keys move days, Page Up/Down move months, Enter selects, typed entry in the two inputs always works |
| Chart | Tab focuses the chart, Left/Right move between buckets, Esc clears the readout |
| Command palette | Ctrl/Cmd + K opens, type to filter, Enter runs, Esc closes |

### 10.4 Screen reader specifics

- Money: `Amount` renders visible text such as "−$54.20" and exposes it as text a screen reader reads naturally ("minus $54.20"). Expense and income are distinguished by the row's accessible description, which reads "Expense, Groceries, Checking, 16 October, minus $54.20".
- Masked amounts expose "Amount hidden".
- Icons-only buttons ("Show password", "Swap wallets", row menu) have names that include context ("Actions for Weekly shop at the market").
- Form errors are announced when they appear next to the field and also by moving focus to the first invalid field on submit.
- Loading regions set `aria-busy`. Skeletons are hidden from assistive technology and the region announces when content arrives.
- Tables: captions, `scope` on headers, no layout tables. The mobile stacked layout keeps list semantics (`ul` of items), not a div soup.

### 10.5 Additional requirements

- **Forced colors / high contrast:** borders and focus use system colors; the pace notch and meter fill keep a visible outline; hatch texture remains the exceeded signal.
- **Theme:** both themes are independently validated. Choosing "System" follows the OS and updates live.
- **Reduced motion:** see 3.4.
- **Text zoom to 200%** and spacing overrides are part of the QA checklist for each screen.
- **Language and numbers:** the `lang` attribute follows the locale preference. Numeric formats follow the locale via `Intl`. Names use `dir="auto"` so mixed-direction names display correctly.
- **Authentication:** no cognitive tests. Password fields allow paste and password managers. Reset links work without transcribing codes.

---

## 11. Empty, loading and error states

### 11.1 Rules

- **Skeletons** for route-level and panel-level loading, shaped like the final content with fixed heights so there is no layout shift. A skeleton appears immediately on first load. For refetches (filter change, range change) keep the current content visible and dim it, with a thin progress line, and only show a skeleton if the previous content is irrelevant (a different route).
- **Local spinners** only for isolated actions (a button, a menu action).
- **Never block the whole page** for one region. Each panel handles its own loading and error.
- **Errors** say what happened, what it means for the user, and what they can do. They sit next to the affected region. They never show raw codes, stack traces, table names or paths. 5xx errors show a short reference (the `requestId`) with a copy button so a user can quote it to the operator.
- **Offline:** a persistent, non-blocking banner "You're offline. Changes can't be saved." appears when requests fail at the network layer and clears when a request succeeds. Form input is preserved.
- **Empty states** answer what appears here, why it is empty, and the next action. They use a primary action and, where useful, a concrete example. No decorative illustrations are required.

### 11.2 Catalog

| Screen / region | Empty | Loading | Error |
| --- | --- | --- | --- |
| Dashboard (no wallets) | Setup panel (5.4) | Hero and band skeleton, panels skeleton | Panel-level: "Couldn't load budgets" with [Try again]. Other panels still render |
| Dashboard (wallets, no transactions) | Position shows balances. Trend and breakdown: "Add a transaction to see your income and spending here." with [Add transaction] | Same | Same |
| Dashboard (range with no activity) | "No transactions between {from} and {to}." [Show last 30 days] | | |
| Transactions (none ever) | "Your ledger is empty. Add your first expense or income." [Add transaction] | 8 skeleton rows | Inline in list: "Couldn't load transactions. Check your connection and try again." [Try again] |
| Transactions (filters match nothing) | "No transactions match these filters." [Clear filters] and a hint to widen the date range | Dim previous | |
| Transactions (no wallets) | Composer area: "Create a wallet before adding transactions." [Create wallet] | | |
| Wallets (none) | "Wallets are where your money lives: accounts, cash, cards, savings." [Create wallet] | 4 skeleton rows | Inline with retry |
| Wallets (all archived) | "All your wallets are archived." [Show archived] [Create wallet] | | |
| Categories | Never empty (defaults exist). "Yours" section: "You haven't created categories. Defaults cover most spending." [Create category] | Skeleton lists | Inline with retry |
| Budgets (none) | "Budgets show how much you've spent against a limit, with a warning before you go over." [Create budget] and an example line | 3 skeleton meters | Inline with retry |
| Budgets (period before any start) | "No budgets apply to this period." [Go to today] | | |
| Recurring (none) | "Recurring transactions add rent, salary and subscriptions for you on schedule." [Create recurring] | Skeleton rows | Inline with retry |
| Recurring runs (none) | "No runs yet. The first one is on {date}." | | |
| Reports (no data in range) | "No income or expenses in this range." [Change range] | Chart skeletons | Panel-level retry |
| Reports (range too large) | Inline: "That range is too long for daily grouping. Choose weekly or monthly." (`RANGE_TOO_LARGE`) | | |
| Settings | n/a | Form skeleton | Save failed: inline "Couldn't save your changes. Try again." Values preserved |
| Admin overview | n/a | List skeleton | "Couldn't load platform totals." [Try again] |
| Admin users (no match) | "No accounts match these filters." [Clear filters] | 10 skeleton rows | Inline with retry |
| Admin audit (no match) | "No audit entries match these filters." [Clear filters] | 10 skeleton rows | Inline with retry |
| Reset link invalid | State screen (5.3) | Verifying skeleton "Checking your link..." | n/a |
| Not found | "This page doesn't exist." [Go to dashboard] | | |
| Signed out by server | `/login` with "You were signed out. Sign in to continue." | | |
| Rate limited (any form) | | | "Too many attempts. Try again in {n} seconds." (from `Retry-After`), control re-enables when the time elapses |
| Unexpected error (route) | | | Route error boundary: "Something went wrong on our side." Reference {requestId} [Copy] [Reload] |

### 11.3 Confirmations and success

- Outcomes the user can see change on screen (a row appears, a toggle flips) get an inline or live-region status, not a toast.
- Outcomes that happen elsewhere or leave the screen (create wallet from a sheet, delete) get a toast with the same verb as the button: "Create wallet" → "Wallet created".
- Milestones (first transaction, first budget) get a single quiet confirmation line in the Position band or Budgets header. No confetti.

---

## 12. Microcopy and tone

The writing for shipped copy is done by the web-content-copywriter agent (section 17). This section defines the voice, vocabulary and patterns the layout assumes.

### 12.1 Voice

Calm, exact and plain. A knowledgeable colleague, not a mascot. Sentence case everywhere. Active voice. Short sentences. No exclamation marks, no emoji, no puns, no "oops", no shame about spending ("overspent" is stated as a fact: "Over by $45.20"). Errors do not apologize and do not blame. Numbers are exact and complete. The interface says "you" for the user and avoids "we" except in security statements about what Midas did.

### 12.2 Vocabulary (use consistently)

| Use | Not |
| --- | --- |
| Wallet | Account (reserved for sign-in accounts), bank, pot |
| Transaction; Expense, Income, Transfer | Entry, record, payment |
| Category | Tag, label |
| Budget; limit; spent; left; over by | Allowance, cap |
| Recurring transaction (short: Recurring) | Template, schedule (in UI) |
| Archive (wallet, reversible) | Delete (only when permanent) |
| Retire (admin, default categories) | Remove, disable |
| Sign in, Sign out, Create account | Log in, Login, Register, Sign up |
| Reset password | Recover |
| Administrator (role label) | Superuser |

Actions keep one name through the whole flow: button "Create wallet", toast "Wallet created", empty-state button "Create wallet". Buttons name the outcome: "Add expense", "Move money", "Save changes", "Create budget", "Delete expense", "Archive wallet", "Suspend account", "Update password", "Send reset link". Avoid "Submit", "OK", "Yes".

### 12.3 Patterns

| Situation | Pattern | Structural example |
| --- | --- | --- |
| Field error | What is wrong, how to fix it | "Enter an amount greater than 0." |
| Form error | What happened, what is preserved, next step | "Couldn't save. Your changes are still here. Try again." |
| Destructive dialog | Title is the question with the object. Body lists effects and reversibility. Button repeats the verb | "Archive Checking?" / "It will be hidden... You can unarchive it later." / [Archive wallet] |
| Empty state | What lives here, why empty, next action | "Wallets are where your money lives. You haven't added one yet." [Create wallet] |
| Status after action | Past tense, includes the key number | "Expense added. Checking is now $1,180.00." |
| Rate limit | Says when to retry | "Too many attempts. Try again in 42 seconds." |
| Security neutral | Never reveal account existence | "If an account exists for that email, a reset link is on its way." |
| Warning state | State, number, remaining | "Near limit. 85% used, $45.00 left." |
| Admin consequence list | Bulleted, concrete, ends with reversibility | "They can't sign in until you reactivate them." |

### 12.4 Numbers, dates, units

- Money always comes from `Amount`. Never hand-built strings.
- Dates: relative for today and yesterday ("Today", "Yesterday"), otherwise "Fri, 16 Oct" (year added when not the current year), formatted with the user's locale. Ranges: "1 Oct to 31 Oct 2026". Audit uses ISO-like UTC.
- Percentages: whole numbers, with "<1%" for tiny values.
- Time-based notes use the user's timezone, except the audit log.

---

## 13. Category icon and color allowlists (confirmed)

This resolves database.md open item 7 (E4-F1-S2). The proposals in `database.md` section 12.1 are **confirmed with no changes**: all 28 distinct icon keys and all 13 color keys used by the 29 system categories in the seed exist in the allowlists below. The seed will not fail on a missing key. The allowlists are exported from `packages/shared` as `CATEGORY_ICONS` and `CATEGORY_COLORS` (the color export carries light and dark values and a display label). Keys match the database shape check `^[a-z0-9-]{1,40}$`.

### 13.1 Rules

- Stored value is the key only. Hex values live in the shared package and tokens, so a palette can be retuned without a migration.
- A key removed from an allowlist later never invalidates stored rows. Unknown icon renders `tag`, unknown color renders `slate`.
- Icon keys are Lucide icon names (kebab case). A shared test imports each key from the pinned icon library version to catch renamed icons.
- Each category displays as a chip: a 32px rounded square (4px radius) filled with the color at 14% (light) or 20% (dark) over the surface, with the icon stroke in the full color. The icon-on-tint contrast is at least 3.4:1 in every combination below (measured, requirement 3:1).
- Category identity is never carried by color alone: the chip always has the icon, and lists and charts always show the name.

### 13.2 Colors (14)

Contrast is the color against `surface` (light `#FBFCFA`, dark `#141D1B`). Tint contrast is the color against its own chip background.

| Key | Label | Light | Dark | Contrast light / dark | On tint light / dark | Group |
| --- | --- | --- | --- | --- | --- | --- |
| `blue` | Blue | `#2358C4` | `#3987E5` | 6.25 / 4.73 | 5.07 / 3.64 | Core |
| `yellow` | Yellow | `#8A6D00` | `#C98500` | 4.78 / 5.60 | 4.00 / 4.18 | Core |
| `pink` | Pink | `#BF2F78` | `#D55181` | 5.24 / 4.36 | 4.25 / 3.51 | Core |
| `green` | Green | `#1F7A3E` | `#3AA14A` | 5.22 / 5.22 | 4.32 / 3.93 | Core |
| `violet` | Violet | `#7A3FC4` | `#9085E9` | 6.12 / 5.50 | 4.98 / 4.07 | Core |
| `orange` | Orange | `#C4560C` | `#D95926` | 4.36 / 4.43 | 3.63 / 3.56 | Core |
| `teal` | Teal | `#00836F` | `#1AA08A` | 4.56 / 5.27 | 3.79 / 3.97 | Core |
| `red` | Red | `#C0352B` | `#E66767` | 5.39 / 5.32 | 4.36 / 4.07 | Core |
| `amber` | Amber | `#A85F00` | `#D07A12` | 4.74 / 5.30 | 3.94 / 4.00 | Extended |
| `lime` | Lime | `#587A0E` | `#7FA832` | 4.85 / 6.18 | 4.06 / 4.44 | Extended |
| `cyan` | Cyan | `#0B7A9A` | `#1E9DC6` | 4.79 / 5.48 | 3.97 / 4.06 | Extended |
| `indigo` | Indigo | `#4B45C8` | `#7A74E6` | 6.84 / 4.48 | 5.50 / 3.50 | Extended |
| `brown` | Brown | `#8A5A3C` | `#A8754F` | 5.66 / 4.36 | 4.66 / 3.39 | Extended |
| `slate` | Slate | `#55646E` | `#7F929D` | 5.94 / 5.32 | 4.91 / 3.97 | Extended |

All 14 meet 3:1 as graphics in both themes. Most also meet 4.5:1, so they remain legible as thin icon strokes.

### 13.3 Chart safety and auto-assignment order

The eight **Core** colors were validated with the palette validator as a categorical set, in this fixed order, against each theme's surface:

`blue, yellow, pink, green, violet, orange, teal, red`

| Check | Light | Dark |
| --- | --- | --- |
| Lightness band | pass | pass |
| Chroma floor | pass | pass |
| Worst adjacent color-vision difference | ΔE 7.2 (floor band, `green` and `pink`) | ΔE 6.2 (floor band, `green` and `pink`) |
| Worst adjacent normal-vision difference | ΔE 23.0 | ΔE 19.3 |
| Contrast against surface | at least 3:1, all 8 | at least 3:1, all 8 |

The two color-vision results sit in the "floor" band, which is acceptable only with a secondary encoding. Midas always provides one: breakdown bars are directly labeled with the category name and value, charts have a legend or direct labels, and every chart has a table view. The first three core colors validate under the stricter all-pairs test in both themes, which is the rule if a future chart plots categories as scattered points.

Use of the order: when a user opens "Create category", the suggested color is the first Core color not yet used by that user's categories of the same type (wrapping after eight). The user can pick any of the 14. The **Extended** six (amber, lime, cyan, indigo, brown, slate) are neutral or close in hue to a Core color, so they rely on the icon and the label for identity. Slate and brown are intentionally low in chroma and therefore fail the "reads as a hue" test by design. They are for neutral categories ("Other", "Taxes", "Fees"). Three warm colors (orange, amber, yellow) can be hard to separate. This is accepted because the icon and name always accompany the color.

### 13.4 Icons (70)

Grouped as the picker shows them. Keys marked (seed) are used by the system category seed.

| Group | Keys |
| --- | --- |
| Money and work | `briefcase` (seed), `laptop` (seed), `store` (seed), `trending-up` (seed), `percent` (seed), `circle-plus` (seed), `rotate-ccw` (seed), `wallet`, `banknote`, `coins`, `piggy-bank`, `credit-card`, `landmark` (seed), `receipt` (seed), `building-2`, `handshake`, `trophy` |
| Home and bills | `house` (seed), `zap` (seed), `wifi` (seed), `droplet`, `flame`, `lightbulb`, `sofa`, `wrench`, `hammer`, `smartphone`, `tv` |
| Food and drink | `shopping-cart` (seed), `utensils` (seed), `coffee`, `beer`, `wine`, `pizza`, `apple` |
| Transport | `bus` (seed), `fuel` (seed), `car`, `bike`, `train-front`, `plane` (seed), `luggage`, `map-pin` |
| Health and family | `heart-pulse` (seed), `shield` (seed), `stethoscope`, `pill`, `dumbbell`, `baby` (seed), `paw-print` (seed), `heart`, `hand-heart` |
| Leisure and learning | `film` (seed), `graduation-cap` (seed), `book-open`, `gamepad-2`, `music`, `camera`, `ticket`, `umbrella`, `leaf` |
| Shopping and personal | `shopping-bag` (seed), `sparkles` (seed), `gift` (seed), `shirt`, `scissors`, `repeat` (seed) |
| General | `circle-ellipsis` (seed), `calendar`, `tag` (fallback) |

Each icon needs a human label for the picker's accessible name (derived from the key: "Shopping cart") and a short keyword list for search (for example `shopping-cart`: groceries, store, buy). Keywords are authored in the shared package next to the key list.

### 13.5 Seed confirmation

| system_key | Icon | Color | Status |
| --- | --- | --- | --- |
| `income.salary` | `briefcase` | `green` | Confirmed |
| `income.freelance` | `laptop` | `teal` | Confirmed |
| `income.business` | `store` | `cyan` | Confirmed |
| `income.investments` | `trending-up` | `indigo` | Confirmed |
| `income.interest` | `percent` | `blue` | Confirmed |
| `income.gifts` | `gift` | `pink` | Confirmed |
| `income.refunds` | `rotate-ccw` | `lime` | Confirmed |
| `income.other` | `circle-plus` | `slate` | Confirmed |
| `expense.groceries` | `shopping-cart` | `green` | Confirmed |
| `expense.dining` | `utensils` | `orange` | Confirmed |
| `expense.housing` | `house` | `indigo` | Confirmed |
| `expense.utilities` | `zap` | `yellow` | Confirmed |
| `expense.transport` | `bus` | `blue` | Confirmed |
| `expense.fuel` | `fuel` | `amber` | Confirmed |
| `expense.health` | `heart-pulse` | `red` | Confirmed |
| `expense.insurance` | `shield` | `slate` | Confirmed |
| `expense.entertainment` | `film` | `violet` | Confirmed |
| `expense.shopping` | `shopping-bag` | `pink` | Confirmed |
| `expense.travel` | `plane` | `cyan` | Confirmed |
| `expense.education` | `graduation-cap` | `teal` | Confirmed |
| `expense.subscriptions` | `repeat` | `indigo` | Confirmed |
| `expense.phone_internet` | `wifi` | `blue` | Confirmed |
| `expense.personal_care` | `sparkles` | `pink` | Confirmed |
| `expense.gifts_donations` | `gift` | `red` | Confirmed |
| `expense.kids` | `baby` | `amber` | Confirmed |
| `expense.pets` | `paw-print` | `orange` | Confirmed |
| `expense.fees` | `receipt` | `slate` | Confirmed |
| `expense.taxes` | `landmark` | `slate` | Confirmed |
| `expense.other` | `circle-ellipsis` | `slate` | Confirmed |

Observation for db-agent, no action required: no two seeded categories share both icon and color, so the pair is unique per default. Several defaults share a color (for example `expense.insurance`, `expense.fees`, `expense.taxes` and `expense.other` are all `slate`, and `expense.housing` and `expense.subscriptions` are both `indigo`), and the icon is what tells them apart at a glance. This is acceptable because chips always carry an icon and bars are always directly labeled.

---

## 14. Data needs routed to db-agent

These are requirements that design places on persistence and query design. Items marked **contract** also need an architect decision because they change `api-contract.md` (which implementers may not edit). Priority: **v1** items are needed for the designs above, **v1.1** items are improvements designed so v1 works without them.

| ID | Need | Why (screen) | Query / storage implication | Priority |
| --- | --- | --- | --- | --- |
| DN-1 | **Filtered result summary.** For the same filter set as `GET /transactions`: matching count, plus income, expense and net totals per currency (transfers excluded from income/expense). | Transactions list header "42 transactions - Income $X - Expenses $Y"; export confirmation; makes Load more less opaque. Cursor pages carry no total | New access pattern (AP-19): aggregate over `ix_transactions__user_date` with the AP-07 predicates, index-only where possible. Target p95 under 300 ms at 100k transactions per user. Note count is capped (for example "10,000+") if exact counts are costly | v1 if achievable, otherwise v1.1. **contract** |
| DN-2 | **Category usage counts.** For one category (and ideally in the `GET /categories` list as an optional field): transactions, recurring templates and budgets referencing it. | Delete flow can show "42 transactions, 1 recurring item and 1 budget use this" before the user commits. The contract returns the counts only after deletion | Extends AP-12 with `COUNT` instead of `EXISTS` on `ix_transactions__category_user_date`, `ix_recurring_templates__category_id`, `ix_budgets__category_id`. Cheap per category; avoid computing for the whole list unless asked (`?includeUsage=true`) | v1.1 (v1 works without it using the two-step dialog). **contract** |
| DN-3 | **Period comparison in the summary.** An optional comparison range returning prior-period income and expense totals per currency. | Dashboard and Reports delta ("Expenses 8% lower than September"). Designed as progressive enhancement, hidden if absent | Reuse the AP-09 totals query with a shifted range. No new index | v1.1. **contract** |
| DN-4 | **Search quality.** Confirm that `q` (note substring) is enough and decide on accent-insensitive matching. | Users type "cafe" and expect "Café". The UI additionally maps typed text to category and wallet names client-side (≤ 200 categories, ≤ 100 wallets), so no database work is needed for names | Option: `unaccent` extension plus an expression trigram index on `unaccent(note)`; verify 1 and 2 character queries still perform at 100k rows per user (database.md notes the fallback to the date index). Escape handling for `%`, `_`, `\` is already specified | v1.1 decision; v1 uses the existing index |
| DN-5 | **Audit presentation data.** (a) Resolve a human label for `target` when `target.type = user` (the user's email), done at read time with a join to `users`. (b) Confirm combined filters (actor + action + date range, and target + date range) stay within AP-14 targets on the existing four indexes. (c) Confirm `targetId` as a filter is supported (the contract has it). | Audit table "Target" column shows an email instead of a UUID fragment; investigations from the user detail drawer ("View audit trail") | Join on `users.id = audit_logs.target_id` limited to the page. No new indexes expected; verify with EXPLAIN on the combinations. The email is already visible to admins elsewhere | v1 for (b) and (c), v1.1 for (a). **contract** for (a) |
| DN-6 | **Audit retention visibility.** The UI states "Entries are kept for 400 days." | Audit screen footer. The value must match the maintenance purge (database.md section 10.5, DB-ADR-11) | If retention becomes configurable, expose the effective value (for example in `GET /admin/metrics` or a config endpoint) instead of hard-coding | v1 (static text) |
| DN-7 | **Platform metrics history.** A nightly snapshot of the aggregate counts. | Admin overview trend sparklines ("new accounts over 30 days"). v1 shows a single snapshot only | The `platform_metric_snapshots` table already suggested in database.md risk 4. Aggregates only, no per-user data (ADR-018) | v1.1 |
| DN-8 | **My sessions and security activity.** List the signed-in user's active sessions (device label, approximate sign-in time, last used) with the ability to revoke one, and a short list of their own recent security events (sign-ins, password changes). | Settings > Security: "Where you're signed in". Design reserves the space; v1 shows only password change and sign out | Uses `sessions` (`ix_sessions__user_active`) and `audit_logs` filtered by `actor_user_id` (`ix_audit_logs__actor_occurred_at`). Show `user_agent` parsed to "Browser on OS" and an IP prefix only (full IP not shown to the user). Sessions are retained 30 days after they end. **contract** | v1.1 |
| DN-9 | **Undo for deletes.** Soft delete with a 30 day recovery window for transactions and transfers. | An "Undo" action after delete. v1 deliberately uses confirmation dialogs instead (and the Definition of Done acceptance requires confirmation) | Would add `deleted_at` to `transactions`/`transfers`, change the balance trigger, every list/aggregate predicate and the unique indexes. Not recommended for v1 given the complexity. If chosen later it needs its own ADR | Deferred. Not recommended for v1 |
| DN-10 | **Saved filter views.** Store named filter sets per user (for example "Groceries last 90 days"). | Transactions toolbar "Saved views" (post v1). In v1 the URL is the saved view and can be bookmarked | `saved_views` (id, user_id, name ≤ 60, query jsonb ≤ 2 KB, limit 20 per user). jsonb validated against the shared filter schema | v1.1 |
| DN-11 | **Budget history across periods.** Return the last N periods' spent/limit for one budget. | A small history strip on the budget detail ("last 6 months") | Aggregate by period using the AP-09 pattern grouped by bucket. v1 shows the current period and period navigation (one request per navigation) | v1.1. **contract** |
| DN-12 | **Complete data export and account erasure.** CSV export covers transactions only. | Settings should eventually offer "Download my data" and "Delete my account". The designs omit both and say so honestly in Settings ("Account deletion isn't available yet") | database.md section 10.4 already notes erasure needs its own migration and runbook. Needs an architect decision on scope and a retention statement | Flag now, decide before public release. **contract** |
| DN-13 | **Recent categories and notes for quick-add.** | Quick-add shows recent categories and could suggest notes | v1 derives recent categories client-side from the most recent 100 transactions already fetched. No new query. If note suggestions are wanted later, add a top-N distinct notes query (bounded, per user, last 90 days) | Client-side in v1. No db work |
| DN-14 | **Retention of personal UI data.** None is stored server side (density, hide-amounts, dismissed setup are local). | Confirms no new tables for preferences | Documented so it is not accidentally added | Info |
| DN-15 | **Currency-aware amount filter and sort** (`currency` parameter on `GET /transactions` and export). Full entry in [18.4.2](#1842-persistence-and-data-needs-routed-to-db-agent-and-the-architect) | Amount filter on the Transactions page is only unambiguous within one currency | Predicate on `transactions.currency`, no new index expected | v1.1. **contract** |
| DN-16 | **Wallet dependents** (`activeRecurringCount` / `hasRecurringTemplates` on `Wallet`). See 18.4.2 | Archive dialog count, delete eligibility, currency lock | `COUNT`/`EXISTS` on `ix_recurring_templates__wallet_id` | v1.1. **contract** |
| DN-17 | **Idempotency key for `POST /transactions` and `POST /transfers`.** See 18.4.2 | Safe retry of quick-add after a lost response | Key plus request hash per user with a TTL; needs an ADR | v1.1. **contract** |

Data-volume assumptions used by the designs: up to 100 wallets and 200 categories, budgets and templates per user (all loaded in one request), 10,000 transactions per active user per year (cursor paging, windowed rendering), 50,000 users (offset paging with totals), 5 million audit rows (cursor paging).

---

## 15. Security-aware UI notes for the frontend agent

### 15.1 Sensitive data

- Never display tokens, hashes or secrets. The reset token is read from the URL fragment, removed from the address bar immediately (`history.replaceState`), and never logged or sent anywhere except the verify and reset calls.
- Passwords: masked by default with an explicit show/hide control (`aria-pressed`). Clear password state from memory when leaving the form after success.
- "Hide amounts" is a privacy aid for shoulder-surfing and screen sharing, not a security control.
- The page title and URLs must not contain amounts, account names or user ids. Transaction detail URLs use opaque ids only. Admin URLs include a user id (needed for linking) but never an email.
- The access token stays in memory only (architecture section 9). No financial data is written to local storage. The only items stored locally are the UI preferences in 7.4.

### 15.2 Account enumeration

- Login uses one generic message for unknown email and wrong password. Forgot password always shows the same confirmation.
- Registration with an existing email returns `409 EMAIL_TAKEN`, which is a disclosure risk (architecture R5). The design minimizes it: the message names no account details ("That email can't be used. Sign in or reset your password."), appears only after submit (no live "email taken" check while typing), and rate limits apply. If the architect later changes the contract to a neutral response, the UI shows a confirmation screen instead of an error.
- Suspended accounts are told only after the correct password is verified (as the API does).

### 15.3 Forms and autocomplete

| Field | `autocomplete` | Notes |
| --- | --- | --- |
| Sign-in email | `username` | `type="email"`, `autocapitalize="none"`, `spellcheck="false"` |
| Sign-in password | `current-password` | |
| Register and reset password, change password new | `new-password` | Password managers can generate |
| Change password current | `current-password` | |
| Display name | `name` | |
| Amount, note, wallet name, category name | `off` | Prevents browser suggestions of financial text |
| Admin suspension reason | `off` | |
| One-time codes and card numbers | not used in v1. If added later: `autocomplete="off"` for CVV and OTP-style fields | |

### 15.4 Redirects

The sign-in "return to where you were" feature must not trust a URL parameter. Accept only a same-origin path that starts with a single `/`, is not protocol-relative (`//`), contains no scheme, and matches a known route; otherwise go to `/dashboard`. Prefer router state or a validated search value over a free-form `?redirect=` URL. The check lives in one helper with unit tests including `//evil.example`, `/\evil.example`, `javascript:` and encoded variants.

### 15.5 Embedding and headers

The sign-in, register and reset pages and the whole app must never render inside a frame (`frame-ancestors 'none'` is already in the CSP). Do not add any `postMessage` or embed features. Because the CSP is strict (`script-src 'self'`, `style-src 'self'`):

- The theme must be applied before first paint by a small **external** script loaded in `head` (not an inline script), otherwise the page flashes the wrong theme or the CSP blocks the script.
- Do not write inline `style` attributes into markup, and do not inject `<style>` tags at runtime (architecture R9). Use class tokens and the framework's DOM style API.
- Fonts are self-hosted. No third-party font, icon or analytics origin is allowed by the CSP.

### 15.6 Destructive and sensitive actions

- Account-level changes (password change) require the current password (the API does).
- Admin role changes and suspensions use a confirmation dialog that lists consequences. The API has no re-authentication step. A step-up password prompt for role changes is a recommended v1.1 addition (flag for the architect).
- Admins cannot be demoted or suspended through the UI when they are the current user, and the UI explains why. The server remains the authority.
- Render all server-provided text (names, notes, suspension reasons, audit metadata, user agents) as text, never as HTML. No `dangerouslySetInnerHTML`.

### 15.7 Session UX

Sign out is visible in the user menu and the mobile More sheet. A forced sign-out (`SESSION_INVALID`) lands on the sign-in page with an explanation and, if the path is valid, returns the user there. Unsaved composer content is held in memory only and is lost on a forced sign-out. The session has no idle timeout in v1 (it ends by absolute expiry at 90 days or revocation), so no countdown warning is designed.

---

## 16. Story coverage and open questions

### 16.1 Stories covered by this document

| Story | Title | Where covered |
| --- | --- | --- |
| E1-F4-S1 | Design system and theme tokens | Sections 2, 3, 7, 8.2, 10 (tokens in both themes, component states, contrast verification, breakpoints in 3.6) |
| E1-F4-S2 | App shell and navigation wireframes | Sections 4.3, 6.1, 9, 11 (desktop, tablet and mobile navigation, empty, loading and error states, admin variant) |
| E2-F1-S2 | Auth flows design | Sections 5.1 to 5.3, 6.2, 6.11, 10, 15 (register, login, forgot and reset, settings; validation and errors; keyboard and screen reader behavior) |
| E3-F1-S2 | Wallet screens design | Sections 6.5, 5.7 and **18.1** (list, create and edit, archive confirmation, balance display, negative-balance styling with contrast ratios, mobile) |
| E4-F1-S2 | Category UX: icons and colors | Sections 6.6, 13 and **18.2** (allowlists with recomputed contrast ratios in 18.2.3, picker interaction, system versus custom) |
| E5-F1-S2 | Transaction list and form design | Sections 5.5, 5.6, 6.4 and **18.3** (quick-add and full form in expense, income and transfer modes, filter, search and pagination patterns, empty and error states) |
| E6-F1-S2 | Budget screens design | Sections 5.8, 6.7, 6.9, 8.4 (list, form, under/near/over states, not color-only) |
| E7-F2-S1 | Dashboard design | Sections 6.3, 6.10, 8, 9 (cards, charts and recent list for desktop and mobile; chart alternatives; date-range control) |
| E8-F1-S2 | Recurring screens design | Sections 5.9, 6.8 (frequency picker, next-date preview, pause and resume, mobile) |
| E9-F2-S1 | Admin screens design | Sections 5.11, 6.12 (users, categories, metrics, audit; destructive confirmations; accessible data tables) |

Acceptance criteria are not ticked here. `qa-agent` owns verification and the only transition to Done.

### 16.2 Open questions for the architect and product owner

| # | Question | Impact | Default if unanswered |
| --- | --- | --- | --- |
| 1 | Do archived wallets count toward the 100 wallet limit? | `LIMIT_REACHED` copy can only advise correctly once this is known | Copy states the limit only and gives no advice |
| 2 | Should the registration duplicate-email response become neutral (architecture R5)? | Register flow wording and an extra confirmation state | Keep the contract's 409 with the minimized wording in 15.2 |
| 3 | DN-1, DN-2 and DN-3 contract changes | List header, delete flow, deltas | Ship v1 without them as designed |
| 4 | Is a step-up password prompt wanted for admin role changes? | One more dialog step | Not in v1 |
| 5 | Is account deletion and full data export in scope before release? | Settings content, legal copy | Not in v1, stated honestly in Settings |
| 6 | Supported locales and currencies lists (shared package) | Pickers need labels and search keywords; RTL readiness | Design assumes logical CSS properties so RTL works if a RTL locale is added |
| 7 | Brand wordmark and favicon | The wordmark is set in Bricolage 700. The favicon is a pine square with a brass notch | Proposed here, no further asset work required for v1 |
| 8 to 11 | Sprint 2 questions: overlay model on any route, filter text and thresholds in the URL, archive confirmation strength, default date range of the ledger | See [18.4.4](#184-contract-and-data-needs-and-deviations-found-in-earlier-sections) | Defaults stated there |

### 16.3 Implementation risks to watch

- **CSP versus UI libraries** (architecture R9): verify charts, Radix popper positioning and any toast library under `style-src 'self'` early in E1-F2-S2, not at the end of the project.
- **Font loading** can cause layout shift or a hero figure flash. Use size-adjusted fallbacks and test CLS on the dashboard.
- **Combobox accessibility** is the most error-prone custom widget (category, wallet, currency, timezone). Reuse one implementation and cover it with keyboard and screen reader tests.
- **Money input** edge cases (locale separators, paste, currencies with 0 or 3 decimals, very large values) need a shared, heavily tested parser in `lib/money`.
- **Windowed lists** must keep correct row semantics and focus behavior. Only introduce windowing past about 200 rows.

---

## 17. Copy handoff

Structural copy in this document is placeholder text that proves layout and line counts. The web-content-copywriter agent should write the shipped strings. Each item below lists the role, audience, tone and layout constraint.

| # | Copy | Audience | Tone | Constraint |
| --- | --- | --- | --- | --- |
| C-1 | Auth screens: headings, field labels, helper text, error messages for sign in, register, forgot, reset (including the neutral duplicate-email wording, the suspended-account message and the rate-limit message with a countdown) | Everyone, often stressed when locked out | Calm, exact, no blame | Form column is 400px. Messages should fit two lines. Must not reveal whether an account exists (15.2) |
| C-2 | First-run setup panel: title, three step names and descriptions, progress label, completion lines | New user, a few seconds of attention | Encouraging but plain | Step names under 28 characters. Description one sentence |
| C-3 | Empty states for every screen in the 11.2 catalog | Users who haven't added data | Explain value, then action | Title under 8 words, body one or two sentences, button names the outcome |
| C-4 | Destructive confirmations: delete transaction, delete transfer, archive wallet, delete wallet, delete category (both steps), delete budget, delete recurring, suspend, reactivate, change role, retire category | Users and admins about to lose or restrict something | Direct, lists effects, states reversibility | Title is a question with the object name. Body 1 to 3 short sentences or a 2 to 4 item list. Primary button repeats the verb |
| C-5 | Status and toast messages: add, edit, delete, transfer, archive, pause and resume (including the no-backfill explanation), export, budget crossing warning and exceeded, theme change, save success | Users confirming an action | Past tense, includes the key number | Under 90 characters, one sentence |
| C-6 | Field validation messages for every form (amount, category, wallet, date, note length, name uniqueness, threshold range, range too large, start date too old) | Users fixing input | Say what to do, not what is wrong | One line under the field, under 70 characters |
| C-7 | Budget state labels and announcements (On track, Near limit, Over by, days to go, attention strip lines, live region summary) | Users and screen reader users | Factual, never alarmist | Badge labels under 14 characters. Announcement sentence under 120 characters |
| C-8 | Recurring: schedule sentences ("Every 2 weeks on Friday", month-end clamping explanation), run outcome messages, failure reasons translated from error codes | Planners | Plain, precise | Schedule sentence under 48 characters. Failure reason one sentence with a next step |
| C-9 | Admin: privacy statement, metrics labels, audit action labels (all 17 `AuditAction` values in plain words), filter labels, retention note | Operators | Neutral, exact | Audit label under 32 characters. Keep the raw code visible separately |
| C-10 | Settings: section intros, currency and locale explanations, password change notice, honest notices for unavailable features (email change, account deletion) | Everyone | Clear, no marketing | One or two sentences per field |
| C-11 | Error pages and global errors: offline banner, unexpected error with reference, not found, forced sign-out, rate limit | Everyone | Calm, tell what to do | Reference id is shown as a copyable token. No technical terms |
| C-12 | Command palette items, tooltips, and screen-reader-only labels and announcements | All | Short, consistent with 12.2 vocabulary | Names under 24 characters |

Sprint 2 additions (structural copy lives in section 18):

| # | Copy | Audience | Tone | Constraint |
| --- | --- | --- | --- | --- |
| C-13 | Wallets: page and empty states, wallet type hints (cash, bank, card, savings), balance qualifiers ("owed", "credit", "Overdrawn"), form helpers (opening balance, currency lock), archive, unarchive and delete dialogs (including the total-balance and recurring-pause consequences), toasts with Undo | Everyday user, sometimes anxious about a negative balance | Calm, exact, never alarming about card debt | Type hints one line under 40 characters. "Owed" and "Overdrawn" are single words. Archive dialog: 4 bullets, each under 90 characters |
| C-14 | Categories: page and section headings, "Default" and read-only explanation, form helpers, the 70 icon labels and 3 to 6 search keywords each (shared package), 14 color names, delete steps 1 and 2, result toast with counts, repair notices for unknown icon or color | Everyday user | Plain, no jargon | Icon label under 24 characters. Color names are single words. Toast under 120 characters, zero counts omitted |
| C-15 | Transactions: quick-add labels and status lines, filter labels and presets, active-chip accessible names, result-count announcements, unknown-outcome failure message, archived-wallet read-only notice, empty and error states in 18.3.9, composer field validation messages | Everyday user capturing quickly; planner reviewing | Short, specific, past tense for outcomes | Field messages under 70 characters. Announcements under 120 characters. Button labels name the outcome ("Add expense", "Move money") |

When writing, follow the vocabulary and patterns in section 12 and keep each feature's strings in its `strings.ts` module (architecture R15) so a later localization pass is mechanical.

---

## 18. Sprint 2 feature specifications (wallets, categories, transactions)

**Stories:** E3-F1-S2 (wallet screens), E4-F1-S2 (category icons, colors and pickers), E5-F1-S2 (transaction list, filters and forms). **Added:** 2026-10-17.

This section deepens sections 6.4, 6.5, 6.6 and 13 into build-ready specs: routes, component names, states, responsive rules, keyboard and ARIA behavior, error mapping, and CSP-safe construction. It does not replace those sections. Where this section is more specific, it wins, and the earlier text carries a "Refined in 18.x" pointer. Wireframe wording is structural copy (section 17). Frontend stories that consume this section: E3-F1-S4, E4-F1-S4, E5-F2-S3, E5-F2-S4 and E3-F2-S2.

Contents of this section: [18.0 Shared conventions](#180-shared-conventions) · [18.1 Wallets](#181-wallets-e3-f1-s2) · [18.2 Categories](#182-categories-icons-and-colors-e4-f1-s2) · [18.3 Transactions](#183-transactions-e5-f1-s2) · [18.4 Contract and data needs, deviations found](#184-contract-and-data-needs-and-deviations-found-in-earlier-sections)

### 18.0 Shared conventions

#### 18.0.1 CSP-safe construction rules

The SPA runs under `script-src 'self'` and `style-src 'self'` (CONTRIBUTING.md, "Content Security Policy and the web app"). The existing `Dialog` is already non-modal for that reason. Every new control in this section follows the same rule: **nothing may inject a `<style>` element or write a `style=""` attribute into HTML markup.** Setting `element.style` through React's `style` prop is a DOM API call and is allowed, but this section avoids it wherever a class or attribute will do.

| Need | Build it with | Do not use |
| --- | --- | --- |
| Modal overlays (forms, confirmations) | Existing `Dialog` (`modal={false}` Radix plus own scrim and `scroll-locked` body class). Add a `variant="drawer"` (right edge, 440px) next to the existing `dialog` and `sheet` | Radix modal mode, any lib that wraps `react-remove-scroll` |
| Short pick-one lists (sort order, budget period, recurring frequency) | Native `<select>` styled with tokens | Radix `Select`. It always mounts `react-remove-scroll`, which injects a `<style>` and is blocked. This corrects the `Select` row in 7.1 |
| Segmented controls, radio cards, swatch and icon pickers | Native `<input type="radio">` inside a `<fieldset>` with a `<legend>`. The input is visually hidden (`sr-only peer`), the `<label>` is the visual, and Tailwind `peer-checked:` and `peer-focus-visible:` variants draw selected and focus. Arrow-key behavior is the browser's | Custom roving-tabindex code, `role="radio"` on divs |
| Switch ("Show archived") | Native `<input type="checkbox" role="switch">` with a visible text label | A div-based toggle |
| Searchable lists (category, wallet, currency) and filter popovers | `Combobox` and `FilterPopover` built on `@radix-ui/react-popover` with `modal={false}` (the same mode the dropdown menu already uses) | Modal popovers, portals that rely on injected CSS |
| Per-category color | `data-cat-color="teal"` on the element plus CSS custom properties declared per attribute value in `tokens.css` (18.2.2). The element reads `var(--cat)` | Dynamic Tailwind class names built from strings, per-render inline styles |
| Toast with an action (Undo, View) | Extend `ToastInput` with `action?: { label: string; onSelect: () => void }` and `duration?: number`. Radix Toast supports an action slot via `Toast.Action` | A second toast system |
| Announcements | One app-level `useAnnounce()` hook that writes to a polite live region (assertive only for blocking failures) | Per-component `aria-live` that remounts and drops messages |

Test requirement carried over from CONTRIBUTING.md: for every new overlay (wallet form, category form, composer drawer, filter popovers, combobox listbox, confirm dialogs), a test opens it and asserts `document.head` gained no `<style>` node and the markup has no `style=` attribute.

#### 18.0.2 New and extended primitives required

Existing: `Button`, `IconButton`, `Field`/`Input`, `Badge`, `Dialog`, `Toast`, `Tooltip`, `Skeleton`, `Spinner`, `EmptyState`, `PageHeader`, dropdown menu helpers in `add-menu.tsx`. The stories above need these additions. Names are final so parallel work stays consistent.

| Component | Location | Contract |
| --- | --- | --- |
| `ConfirmDialog` | `components/ui/confirm-dialog.tsx` | Wraps `Dialog` with `role="alertdialog"`. Props: `title`, `consequences: ReactNode[]`, `reversibleNote`, `confirmLabel`, `confirmTone: 'danger' \| 'primary'`, `onConfirm: () => Promise<void>`, `error?`. Initial focus on Cancel (`onOpenAutoFocus` override). Confirm button shows loading and ignores repeat activation. Dialog stays open on error and shows an `Alert` |
| `Alert` | `components/ui/alert.tsx` | `info`, `success`, `warning`, `danger`. Icon plus text. `role="alert"` only for `danger` raised after a submit, otherwise `role="status"` |
| `Segmented` | `components/ui/segmented.tsx` | Native radio group. Props: `legend` (visually hidden or visible), `options: {value, label, icon?}[]`, `value`, `onChange`, `size`. Minimum segment 44px wide on touch |
| `RadioCardGroup` | `components/ui/radio-card-group.tsx` | Same engine as `Segmented`, each option is a card with icon, label and a one-line description |
| `Switch` | `components/ui/switch.tsx` | Native checkbox with `role="switch"` |
| `Combobox` | `components/ui/combobox.tsx` | ARIA 1.2 combobox with listbox popup. See 18.3.8 |
| `MoneyField` | `components/domain/money-field.tsx` | Text input, `inputmode="decimal"`, `autocomplete="off"`, locale parsing in `lib/money`, emits `number \| null` minor units, `allowNegative`, `currency` adornment, exponent limited. Shows a field error when digits exceed the currency exponent instead of rounding |
| `DateField` | `components/domain/date-field.tsx` | Typed `YYYY-MM-DD` entry in the user's locale format, Today button, native-feeling calendar in a non-modal popover. Value is `LocalDate` string |
| `FilterPopover`, `FilterChip` | `components/domain/filter-bar/` | See 18.3.5 |
| `Amount` | `components/domain/amount.tsx` | Already specified in 7.2. Add `qualifier?: 'owed' \| 'credit'` handled by `WalletBalance`, not by `Amount` |
| `CategoryChip` | `components/domain/category-chip.tsx` | See 18.2.2 |
| `WalletTypeIcon` | `components/domain/wallet-type-icon.tsx` | Maps `cash` to `banknote`, `bank` to `landmark`, `card` to `credit-card`, `savings` to `piggy-bank`. Decorative (`aria-hidden`) because the type is always written out |

#### 18.0.3 Form behavior shared by all three stories

- Layout: persistent label above the control (`Field`), helper text below the label group, error text below the control with an icon. Errors are linked with `aria-describedby` and `aria-invalid="true"`.
- Submit button: names the outcome, shows the `loading` state (spinner replaces the leading icon, width fixed, `aria-busy`), ignores repeat activation, never disabled merely because the form is incomplete (invalid submit focuses the first invalid field and lists errors). Edit forms may keep **Save changes** disabled until dirty, with the reason in the helper line ("No changes to save.").
- Server errors map to fields through one helper, `applyProblemToForm(problem, fieldMap)`. A `FieldError.field` that matches the map lands on the field. Anything unmapped (and every error with a stable `code` listed in a table below) goes to a form-level `Alert` at the top of the form, and focus moves to that alert. `5xx` shows the `requestId` with a copy button (`ApiErrorAlert`). Input is never cleared on error.
- Network failure on a create (no response received): the outcome is **unknown**, because the server may have committed. The alert says so and gives a safe next step: "We couldn't confirm this was saved. Check your recent transactions before adding it again." with a link that opens the list. The submit button re-enables so the user can retry deliberately. See DN-17 for the idempotency request.
- Dirty close: Esc, the close button, scrim click and route change prompt "Discard this {thing}?" (`ConfirmDialog`, default focus on Keep editing) only when the form is dirty.
- Autocomplete: name, note, amount and all money fields `autocomplete="off"` (15.3). Autofocus goes to the first field on open, except edit forms of a single field set where it goes to the field the user came to change when known.
- Focus return: closing returns focus to the opener. If the opener no longer exists (a deleted or archived row), focus goes to the next row, then the previous row, then the list `h1`.
- Overlay presentation: desktop dialog for wallets and categories, desktop drawer for the transaction composer. Below 768 all three become a bottom sheet (`max-h-[92dvh]`, scrollable body, sticky footer padded with `env(safe-area-inset-bottom)`). `useBreakpoint() === 'mobile'` selects the sheet variant, and the footer buttons stack with the primary on top at full width.

---

### 18.1 Wallets (E3-F1-S2)

#### 18.1.1 Frame

| | |
| --- | --- |
| User and job | Everyday user and planner. "Where is my money sitting, and is any of it wrong?" Visited occasionally (setup, correction, archiving), so the screen favors clarity and exact numbers over speed |
| Primary action | Create wallet. One primary button per view |
| Secondary | Edit, view the wallet's transactions, archive, unarchive |
| Emotional state | Mild anxiety when a balance looks wrong or negative. The screen must show the arithmetic (opening plus activity) and never treat debt as a failure |
| Business value | A first wallet unlocks the whole product (flow 5.4). Empty state and create flow are the first-run critical path |

#### 18.1.2 Routes and components

| Route | Renders | Notes |
| --- | --- | --- |
| `/wallets` | `WalletsPage` | Search param `archived=1` shows the archived section. Parsed by the zod search schema, unknown values ignored |
| `/wallets/new` | `WalletsPage` plus `WalletFormDialog mode="create"` | Opened by Create wallet, empty-state button, dashboard setup panel link. Closing navigates back to `/wallets` preserving search |
| `/wallets/$walletId/edit` | `WalletsPage` plus `WalletFormDialog mode="edit"` | Direct link to an unknown or foreign id: dialog does not open, list shows a status "That wallet doesn't exist." and the URL is replaced with `/wallets` (404 NOT_FOUND) |
| (no route) | `ArchiveWalletDialog`, `DeleteWalletDialog` | Local state from the row menu. Confirmations are not addressable |

```
WalletsPage
  PageHeader "Wallets"  +  actions: Switch "Show archived (n)"  [Create wallet]
  WalletTotals            dl, one entry per currency of active wallets
  WalletList              table >= 640px container width, list below
    WalletRow             WalletTypeIcon, name link, type, currency, WalletBalance, WalletRowMenu
  ArchivedWalletList      section "Archived", only when the switch is on
  WalletsEmptyState / WalletsErrorState / WalletsSkeleton
WalletFormDialog          WalletTypePicker (RadioCardGroup), CurrencyCombobox, MoneyField, BalanceEquation
ArchiveWalletDialog, DeleteWalletDialog   (ConfirmDialog)
```

Data: one query, `GET /wallets?includeArchived=true` (max 100 rows). Active and archived are split on the client, which makes the archived count known without a second request. Composer and filter pickers read the same cache and take only `!archived` (and in the transaction filter, archived wallets too, see 18.3.5). Query key `['wallets']`, invalidation per 7.5.

#### 18.1.3 List layout

Desktop (container width 640px or more; the page is within the 1280px max):

```
+-----------------------------------------------------------------------------------------------+
| Wallets                                      Show archived (2) [ o ]          [ Create wallet ] |
+-----------------------------------------------------------------------------------------------+
| Total balance     USD  $8,080.20          EUR  EUR 1,820.00                                      |
| Active wallets only. Money owed on cards is subtracted. Currencies are never added together.    |
+-----------------------------------------------------------------------------------------------+
| Wallet                          Type       Currency            Balance                       |
|-----------------------------------------------------------------------------------------------|
| [bank]    Checking              Bank       USD                 $1,180.00                [ .. ] |
| [piggy]   Savings               Savings    USD                 $9,200.00                [ .. ] |
| [cash]    Cash                  Cash       USD                   $100.20                [ .. ] |
| [card]    Visa                  Card       USD               -$2,400.00                 [ .. ] |
|                                                                        owed                    |
| [piggy]   Rainy day             Savings    USD                   -$35.00                [ .. ] |
|                                                                [!] Overdrawn                    |
| [bank]    Euro account          Bank       EUR              EUR 1,820.00                [ .. ] |
+-----------------------------------------------------------------------------------------------+
| Archived (2)                                                                                    |
| [bank]  Old savings  (Archived)  Bank   USD           $0.00             [Unarchive]  [ .. ]   |
+-----------------------------------------------------------------------------------------------+
```

Mobile (below 768, or any container under 640px; `ul` of rows, 64px minimum):

```
+-----------------------------------+
| Wallets                           |
| [ Create wallet ]   (full width)  |
| Show archived (2)           [ o ] |
+-----------------------------------+
| Total balance                     |
| USD   $8,080.20                   |
| EUR   EUR 1,820.00                |
| Active wallets only. Cards net... |
+-----------------------------------+
| [bank] Checking          $1,180.00 |
|        Bank - USD            [ .. ]|
| [card] Visa             -$2,400.00 |
|        Card - USD   owed     [ .. ]|
| [piggy] Rainy day          -$35.00 |
|        Savings - USD  [!]Overdrawn  |
|                              [ .. ]|
+-----------------------------------+
| Home | Activity | [ + ] | Budgets | More |
+-----------------------------------+
```

Rules:

- **Semantics.** At 640px container width and above it is a real `<table>` with a caption ("Wallets", visually hidden), `th scope="col"` headers and `th scope="row"` on the name cell. Below 640px it is a `<ul>`; the switch between the two is made by a `useContainerWidth()` hook (ResizeObserver, measured in `useLayoutEffect` so there is no flash) and never by `display: block` on table elements. The same `WalletRow` data component feeds both.
- **Name.** A link to `/transactions?wallet=<id>` (the question "what makes up this balance" is one click away). Truncates with an ellipsis at one line in the table (`min-w-0 truncate`); wraps to at most two lines on mobile (`line-clamp-2`). The full name is always in the DOM and in the edit dialog. Names are 1 to 60 characters, so truncation is a real case.
- **Columns (container ≥ 640px):** icon 32px, name flexible with a minimum of 12rem, type 7rem, currency 6rem, balance 13rem, menu 2.5rem. The balance column is sized for the largest legal value (`-$1,000,000,000,000.00`, 22 characters in tabular figures at 16px, about 13rem) and never wraps or truncates digits. At container widths between 640px and 800px the Currency column is dropped (currency appears after the amount only when it differs from the preference, 6.5) and type moves under the name as `ink-2` caption text.
- **Balance cell.** The amount sits on the first line at a fixed baseline in every row so the amounts form one clean right edge. A qualifier (the word "owed", or the Overdrawn badge) sits on a second line under it, right aligned. Rows without a qualifier keep the empty second line, so row height is constant (56px comfortable, 64px on mobile).
- **Sort.** Alphabetical by name as returned by the API. No sorting controls in v1 (at most 100 rows).
- **Archived section.** An `h2` "Archived (n)" below the active list, only when the switch is on. Archived rows: name in `ink-2` (never lighter), a neutral `Badge` "Archived", the final balance, an inline **Unarchive** button and the same menu minus Edit and Archive. They stay in the DOM order after the active list, so screen reader users meet them last.
- **Totals.** `WalletTotals` is a `dl`: `dt` is the currency code, `dd` is the `Amount`. It is the sum of **active** wallets per currency including negative card balances, which is the same definition as `totalsByCurrency.balanceMinor` in `GET /reports/summary`. The caption under it states both rules. It is hidden when there are no active wallets.
- **Density.** Comfortable only (56px). The admin compact density does not apply.

#### 18.1.4 Balance display and negative-balance styling

`WalletBalance` renders `Amount` (7.2) plus the qualifier. The wallet's own currency is always used, the code is shown after the amount when it differs from the preference currency (symbols are ambiguous), and masking applies when Hide amounts is on (qualifier text stays visible: "owed" does not reveal the figure).

| Case | Amount rendering | Qualifier (second line) | Why |
| --- | --- | --- | --- |
| Positive, any type | `ink`, no plus sign | none | A balance is a state, not a flow. The plus sign is reserved for income in the ledger |
| Zero | `ink`, `$0.00`, no sign | none | Zero is not negative and never gets a minus |
| Negative, `card` | `ink`, true minus (U+2212) | text "owed" in `ink-2`, caption size | Debt on a card is normal. It must not look like an alarm (principle 2) |
| Negative, `cash`, `bank` or `savings` | `danger` text, true minus | `Badge variant="danger"` with `CircleAlert` icon and the word "Overdrawn" | Money below zero where it should not be needs attention. Sign, badge icon and word carry the meaning in addition to color |
| Positive, `card` | `ink` | text "credit" in `ink-3` | The card holds money in your favor (an overpayment or refund). Rare but real, and it avoids a bare positive number that looks like an asset |

Contrast (WCAG 1.4.3, text; measured with the relative luminance formula, surface `#FBFCFA` light and `#141D1B` dark):

| Pair | Light | Dark | Requirement |
| --- | --- | --- | --- |
| `danger` amount on `surface` | 6.39:1 | 7.53:1 | 4.5:1 |
| `danger` text on `danger-tint` (Overdrawn badge) | 5.24:1 | 6.18:1 | 4.5:1 |
| `ink-2` qualifier on `surface` | 7.87:1 | 9.33:1 | 4.5:1 |
| `ink-3` qualifier ("credit", Archived caption) on `surface` | 5.78:1 | 6.27:1 | 4.5:1 |

Accessible text for the balance cell is a single phrase that includes the qualifier: "minus $2,400.00, owed" and "minus $35.00, overdrawn". The badge icon is `aria-hidden`; its text is read. In forced-colors mode the badge keeps its border and icon, so it does not rely on its tint.

When the user edits a wallet's opening balance into a negative value on a non-card wallet, the form shows an `info` line: "This wallet will show as Overdrawn." (polite status), so the badge is never a surprise.

#### 18.1.5 Row menu

`WalletRowMenu` is a Radix dropdown menu (`modal={false}`, as `add-menu.tsx`). Trigger: `IconButton` with `MoreHorizontal`, name "Actions for {wallet name}", 32px (44px coarse pointer). Items:

| Item | Condition | Result |
| --- | --- | --- |
| View transactions | always | Navigates to `/transactions?wallet=<id>` |
| Edit wallet | not archived | Navigates to `/wallets/$walletId/edit` |
| Archive wallet | not archived | Opens `ArchiveWalletDialog` |
| Unarchive wallet | archived | Calls unarchive, no confirmation (reversible, safe) |
| Delete wallet | `hasTransactions === false` | Opens `DeleteWalletDialog` |
| (disabled text) "Delete is unavailable. This wallet has transactions. Archive it instead." | `hasTransactions === true` | `aria-disabled` item that stays focusable so keyboard and screen reader users can read why. Never hidden |

`hasTransactions` does not account for recurring templates, so a delete can still return `409 WALLET_IN_USE` (18.1.7).

#### 18.1.6 Create and edit form

Desktop: `Dialog` 480px (`className="max-w-[30rem]"`). Mobile: sheet. Component: `WalletFormDialog`.

```
+------------------------------------------------+
| Create wallet                              [x]  |
| Name *                                          |
| [ Everyday account                   ]  3 / 60  |
| Type *                                          |
| (o) [bank]  Bank    | ( ) [piggy] Savings       |
| ( ) [cash]  Cash    | ( ) [card]  Card          |
|     (selected card shows its one-line hint)     |
| Currency *                                      |
| [ USD - US dollar                        v ]    |
| Opening balance                                 |
| $ [ 0.00                ]   USD                 |
| What was in this wallet before your first       |
| transaction. Use a minus sign for money owed.   |
|                                                 |
| [ Cancel ]                    [ Create wallet ] |
+------------------------------------------------+

Edit adds, under Opening balance:
  Opening $1,000.00  +  activity $180.00  =  Balance $1,180.00      (BalanceEquation, dl)
  After editing opening to 1,200.00:  "Balance will change from $1,180.00 to $1,380.00."
```

| Field | Control | Rules | Defaults and states |
| --- | --- | --- | --- |
| Name | `Field`, text, `autocomplete="off"`, `maxLength` not set (the counter and error handle length so pasted text is not silently cut) | Required, trimmed, 1 to 60 characters. Counter "n / 60" is visible always and announced only at 50 and above | Empty on create. Focus on open |
| Type | `RadioCardGroup` in a `fieldset` with legend "Type", 2 by 2 on desktop, 1 column below 360px. Each card: `WalletTypeIcon`, label, one-line hint (Cash: "Physical money", Bank: "Checking or current account", Card: "Credit or debit. Below zero means you owe", Savings: "Money set aside") | Required | No default on create (forces a conscious choice but the Create button names the problem if skipped). Edit: current type. Changing type on a wallet with a negative balance updates the styling preview |
| Currency | `CurrencyCombobox` (Combobox, 18.3.8) listing `SUPPORTED_CURRENCIES` as "USD - US dollar", search by code or name | Required | Preference currency. **Locked** when `hasTransactions`: rendered as read-only text with the line "Currency can't change because this wallet has transactions." It also carries a `WALLET_CURRENCY_LOCKED` fallback because templates can lock it too |
| Opening balance | `MoneyField allowNegative` | Signed, within ±1,000,000,000,000.00, limited to the currency's exponent. Optional (empty means 0.00) | 0.00 |

Behavior:

- Enter in any single-line field submits. Ctrl or Cmd plus Enter is not needed (no multiline field).
- The submit label is **Create wallet** or **Save changes**. In edit mode Save changes is disabled until a field differs from the loaded wallet, and the helper line "No changes to save." is linked to it with `aria-describedby`.
- Changing Currency or Type on create never clears other fields.
- Archived wallets are not editable. The edit route for an archived wallet shows the dialog in read-only form with an `info` Alert "Archived wallets are read-only. Unarchive it to make changes." and a single **Unarchive wallet** button. This mirrors `WALLET_ARCHIVED`.
- On success the dialog closes, the new or updated row is highlighted for 1.2 seconds (static 2px left rule when reduced motion is on), focus goes to that row's name link, and a polite status reads "Wallet created." or "Checking updated." No toast, because the result is visible on the page (11.3).

#### 18.1.7 Archive, unarchive and delete

**Archive confirmation** (`ArchiveWalletDialog`, `ConfirmDialog`, focus on Cancel):

```
+-----------------------------------------------------+
| Archive Checking?                               [x]  |
| - It's hidden from lists and pickers, and can't      |
|   receive transactions or transfers.                 |
| - Its balance of $1,180.00 stops counting toward     |
|   your total balance.                                |
| - Its history stays in your transactions and reports.|
| - 2 recurring transactions that use it will be       |
|   paused. They won't restart if you unarchive.       |
| You can unarchive it at any time.                    |
|                                                       |
| [ Cancel ]                      [ Archive wallet ]   |
+-----------------------------------------------------+
```

- The balance bullet is shown only when the balance is not zero. It is a corrected consequence: the API excludes archived wallets from `totalsByCurrency.balanceMinor`, so archiving changes the user's headline total. The earlier text in 6.5 did not say so.
- The recurring count is computed from the cached recurring templates (`status === 'active'`, `walletId` match). While that query is loading the bullet shows a skeleton line; if it failed the bullet reads "Any active recurring transactions that use it will be paused." Bullets are an unordered list inside the dialog description.
- After success: dialog closes, row leaves the active list, focus moves to the next row's name link (previous row, then the page heading, when none), and a toast with an action appears: "Checking archived." with **Undo** (calls unarchive). It stays 10 seconds, pauses on hover and focus. The toast description says "2 recurring transactions were paused." when any were. Undo does not resume them, and the description states that ("Undo won't restart them").
- No typed confirmation: the action is reversible.
- Idempotent API: a double submit is harmless, but the button still ignores repeats.

**Unarchive.** One click from the row, no dialog. On `409 WALLET_NAME_TAKEN` (an active wallet now uses the name) a small dialog opens with the name field prefilled for a rename and the text "Another active wallet is called Checking. Choose a new name to unarchive this one." (This is the user's own data, so there is no disclosure concern.) Success toast: "Checking unarchived. Its recurring transactions stay paused." with a **View recurring** action.

**Delete confirmation** (`DeleteWalletDialog`, only offered when `hasTransactions` is false):

- Title "Delete {name}?" Body: "This can't be undone. It has no transactions." Buttons Cancel and **Delete wallet** (danger). Because it is permanent and the wallet is empty, no typed confirmation is needed.
- `409 WALLET_IN_USE` (recurring templates exist): the dialog stays open and shows a danger Alert "This wallet is used by recurring transactions, so it can't be deleted. Archive it instead." with two buttons: **Archive wallet** (switches to the archive dialog) and a link **View recurring**.
- Success: row removed, focus to next row, toast "Wallet deleted."

#### 18.1.8 States

| State | Presentation |
| --- | --- |
| Loading (first load) | Heading renders immediately. `WalletsSkeleton`: totals band 2 lines and 4 rows at the real row height, parent `aria-busy="true"`, skeletons `aria-hidden` |
| Refetching (after a mutation) | Content stays, no skeleton. The changed row highlights |
| Empty (no wallets at all) | `EmptyState`: "Wallets are where your money lives." sentence and **Create wallet** (primary). No totals band. Dashboard and the add-transaction flows link here |
| Empty (all archived) | Empty state variant "All your wallets are archived." with **Show archived** and **Create wallet**. The switch is forced on when the URL has `archived=1` |
| Error (load) | Inline `Alert` in the list region: "Couldn't load your wallets. Check your connection and try again." with **Try again**. Header and Create wallet remain usable. 5xx shows the request id |
| Error (mutation) | In the dialog as in 18.1.9. For archive and unarchive errors outside a dialog: danger toast with the reason and the row unchanged |
| Limit reached | At 100 wallets the Create wallet button stays enabled (the server is the authority) and the `409 LIMIT_REACHED` alert reads "You've reached the limit of 100 wallets." No advice about archiving until open question 16.2 #1 is answered |
| Offline | Global offline banner (11.1). Forms keep their input |
| Hide amounts on | Amounts and totals masked, qualifiers and badges remain. Equation in the edit dialog masked too |
| Long values | See 18.1.3. A 60 character name truncates in the table and wraps on mobile. A 17 digit balance fits its column |

#### 18.1.9 Server error mapping

| Code | Where it appears | Behavior |
| --- | --- | --- |
| `WALLET_NAME_TAKEN` (create, edit) | Name field | "You already have a wallet with this name." Focus the name field. Input kept |
| `WALLET_NAME_TAKEN` (unarchive) | Rename dialog (above) | |
| `LIMIT_REACHED` | Form-level alert | |
| `WALLET_CURRENCY_LOCKED` | Currency field | "Currency can't change because this wallet has transactions or recurring transactions." The wallet is refetched and the field becomes read-only |
| `WALLET_ARCHIVED` (edit raced with archive) | Form-level alert, then dialog switches to the read-only form | |
| `NOT_FOUND` | Toast "That wallet no longer exists." Dialog closes, list refetches | |
| `VALIDATION_FAILED` with `errors[]` | Matching fields (`name`, `openingBalanceMinor` to Opening balance) | |
| `WALLET_IN_USE` (delete) | Dialog alert (above) | |
| `RATE_LIMITED` | Form-level alert with live countdown from `Retry-After` | |
| Network or 5xx | Form-level alert, input kept, request id on 5xx | |

#### 18.1.10 Keyboard and ARIA

- Page: one `h1`. The totals `dl` and the list are in `main`. The switch has the visible label "Show archived ({n})" and `aria-controls` pointing at the archived section id.
- Table: Tab reaches each name link, then each row menu button; no row has a hidden control. `th scope="row"` on the name so screen readers announce "Checking" with the balance column header. Row menu keys per the menu pattern (Down/Up, Enter, Esc, type-ahead).
- Dialog: focus first field, trap while open, Esc closes (with the discard confirm if dirty), focus returns to Create wallet or the row menu trigger. The type radio cards behave as a native radio group (one tab stop, arrows move and select).
- Live region messages: "Wallet created.", "Checking updated.", "Checking archived.", "Showing archived wallets, 2." when the switch toggles.
- Touch: rows have 44px targets for the name link and the menu button (the 32px desktop size becomes 44px on coarse pointers). Destructive items are separated by a divider and are last in the menu.
- Zoom and reflow: at 320px width and 400% zoom the list layout is used, nothing scrolls horizontally.

---

### 18.2 Categories: icons and colors (E4-F1-S2)

#### 18.2.1 Frame

| | |
| --- | --- |
| User and job | Everyday user who wants spending to be recognizable at a glance. Defaults cover most needs, so creating a category is occasional and should take under 20 seconds |
| Primary action | Create category |
| What must be obvious | Which categories are Midas defaults (read-only) and which are the user's own (editable), without reading a manual |
| Recognition goal | A category is identified by **icon + name** in every list, chip and chart. Color adds speed and personality but never carries identity alone (13.1) |
| Delight | A live preview chip that updates as name, color and icon change, so the result is seen before saving |

#### 18.2.2 Routes, components and color wiring

| Route | Renders |
| --- | --- |
| `/categories` | `CategoriesPage`. Search param `type=expense\|income` selects the tab below 1024px and scrolls to the column above it |
| `/categories/new` | Page plus `CategoryFormDialog mode="create"`. `?type=` presets the type |
| `/categories/$categoryId/edit` | Page plus `CategoryFormDialog mode="edit"` for a user category, or `CategoryDetailDialog` (read-only) when `system === true`. A direct link to someone else's id is a 404 and shows the same "That category doesn't exist." status as wallets |
| (no route) | `DeleteCategoryDialog`, a two-step `ConfirmDialog` |

```
CategoriesPage
  PageHeader "Categories"    [Create category]
  CategoryColumns (>= 1024)  | CategoryTabs (< 1024, Radix Tabs, roving tabindex)
    CategorySection "Yours"      CategoryRow (editable)
    CategorySection "Defaults"   CategoryRow (read-only, DefaultMark)
CategoryFormDialog           CategoryPreview, Field(name), Segmented(type), ColorPicker, IconPicker
CategoryDetailDialog         read-only view of a default category
DeleteCategoryDialog         step 1 confirm, step 2 reassign (Combobox)
```

**`CategoryChip`** (used in lists, pickers, transaction rows, budgets, charts):

| Prop | Values |
| --- | --- |
| `icon` | `IconKey`. Unknown key renders `tag` |
| `color` | `ColorKey`. Unknown key renders `slate` |
| `size` | `sm` 24px (icon 14), `md` 32px (icon 18, default), `lg` 40px (icon 22, picker preview) |
| `name?` | When present, the name follows in `ink` (never in the category color) |
| `retired?` | Appends the muted text "Retired" |

Anatomy: a square, 4px radius, filled with the category color mixed into `surface` (14% in light, 20% in dark, an **opaque** color so it is identical on `surface`, `raised` and `sunken`), the icon stroke (2px, `currentColor`) in the full category color. The chip is `aria-hidden` when the name is adjacent. Standalone chips (a chart mark, a color-only context) get `role="img"` and `aria-label="{name}"`. Transfers use a neutral chip: `arrow-left-right` in `ink-2` on `sunken` (6.78:1 and 10.41:1).

**Color wiring without inline styles.** Palette hex values live in `packages/shared` (`CATEGORY_COLORS`, 13). `tokens.css` carries one rule per key, generated from that export by a build step or kept in sync by a unit test that fails on drift:

```
[data-cat-color='teal']                       { --cat: #00836f; }   /* light */
[data-theme='dark'] [data-cat-color='teal']   { --cat: #1aa08a; }   /* dark  */
:root { --cat-tint-mix: 14%; }   [data-theme='dark'] { --cat-tint-mix: 20%; }
chip background:  color-mix(in srgb, var(--cat) var(--cat-tint-mix), var(--color-surface))
```

The component sets only `data-cat-color={color}` and uses `text-(--cat)` and `bg-(--cat-chip-bg)` utilities, so there is no `style=""`, no dynamic class names and no runtime-injected CSS. SVG charts reference the same attribute (`fill="var(--cat)"` on an element carrying `data-cat-color`).

#### 18.2.3 Palette and contrast (WCAG 2.2 AA, ratios stated)

Method: WCAG relative luminance contrast ratio, recomputed on 2026-10-17 from the hex values in 13.2 (so 13.2 stays the source of truth for the hexes). Thresholds applied: **3:1** for graphical objects and UI component boundaries (SC 1.4.11), **4.5:1** for text (SC 1.4.3). Category colors are used only as icon strokes, swatch fills and chart marks, never as text color. Category names are always set in `ink` (16.28:1 light, 14.73:1 dark on `surface`; 16.76:1 and 13.50:1 on `raised`). Surfaces: `surface` `#FBFCFA` / `#141D1B`, `raised` `#FFFFFF` / `#1A2523`.

| Key | Color vs `surface` L / D | Swatch vs `raised` (dialog) L / D | Icon on chip tint L / D | Check glyph on swatch L (white) / D (`#04201A`) |
| --- | --- | --- | --- | --- |
| `blue` | 6.25 / 4.73 | 6.43 / 4.33 | 5.07 / 3.63 | 6.43 / 4.70 |
| `yellow` | 4.78 / 5.60 | 4.92 / 5.13 | 4.00 / 4.19 | 4.92 / 5.57 |
| `pink` | 5.24 / 4.36 | 5.39 / 3.99 | 4.25 / 3.50 | 5.39 / 4.34 |
| `green` | 5.22 / 5.22 | 5.37 / 4.78 | 4.31 / 3.92 | 5.37 / 5.20 |
| `violet` | 6.12 / 5.50 | 6.30 / 5.04 | 4.97 / 4.08 | 6.30 / 5.48 |
| `orange` | 4.36 / 4.43 | 4.48 / 4.06 | 3.63 / 3.55 | 4.48 / 4.41 |
| `teal` | 4.56 / 5.27 | 4.69 / 4.83 | 3.79 / 3.96 | 4.69 / 5.25 |
| `red` | 5.39 / 5.32 | 5.55 / 4.88 | 4.36 / 4.07 | 5.55 / 5.30 |
| `amber` | 4.74 / 5.30 | 4.88 / 4.86 | 3.95 / 4.03 | 4.88 / 5.28 |
| `lime` | 4.85 / 6.18 | 4.99 / 5.66 | 4.06 / 4.45 | 4.99 / 6.15 |
| `cyan` | 4.79 / 5.48 | 4.92 / 5.02 | 3.97 / 4.08 | 4.92 / 5.46 |
| `indigo` | 6.84 / 4.48 | 7.04 / 4.10 | 5.52 / 3.48 | 7.04 / 4.46 |
| `brown` | 5.66 / 4.36 | 5.82 / 3.99 | 4.67 / 3.41 | 5.82 / 4.34 |
| `slate` | 5.94 / 5.32 | 6.11 / 4.88 | 4.90 / 3.95 | 6.11 / 5.30 |
| **Minimum** | **4.36 / 4.36** | **4.48 / 3.99** | **3.63 / 3.41** | **4.48 / 4.34** |

Results:

- Every swatch fill passes 3:1 against both the page and the dialog surface in both themes (minimum 3.99). The stricter 4.5:1 text threshold is met by most pairs but not required: five colors fall short of 4.5:1 against `surface` in one theme (`orange` L 4.36 and D 4.43, `pink` D 4.36, `indigo` D 4.48, `brown` D 4.36). They are graphics only.
- Every icon on its chip tint passes 3:1 in both themes (minimum 3.41, `brown` dark). Icons are 2px strokes at 18px, so this is the effective threshold, and it is why the chip tint is fixed at 14% / 20% and **never increases on hover or selection** (a 32% dark tint would drop `indigo` to 2.90 and `brown` to 2.85, failing 1.4.11). Hover and selection use rings, not a darker tint.
- The check glyph on a selected swatch passes 3:1 in all 28 combinations (minimum 4.34). Light theme uses white, dark theme uses `#04201A` (`on-primary` dark). The selected ring is `ink` (`#14201C` / `#E8EFEC`): 16.76:1 light and 13.50:1 dark against `raised`.
- Color is never the only cue: icon, name and (in pickers) a written label always accompany it. The Core-8 order, chart-safety checks and the secondary encodings are unchanged from 13.3.
- Forced colors: swatches fall back to a `CanvasText` 1px border and the selected check glyph (which uses `currentColor` on `Highlight`) remains; chips fall back to icon plus name.

#### 18.2.4 Icon set

The allowlist (70 Lucide keys in 8 groups) is confirmed in 13.4 and is not changed. Additions to the definition:

- **Rendering:** `lucide-react`, 2px stroke, `aria-hidden`. Import named icons through a single module `category-icons.ts` that maps each `IconKey` to its component (a literal object of 70 named imports). Do not import the whole `icons` namespace, which would pull every Lucide icon into the bundle. A unit test asserts the map's keys equal `CATEGORY_ICONS` and every key resolves.
- **Picker bundle:** `IconPicker` and its keyword list load lazily (`React.lazy`) when the category dialog first opens, so the Categories route itself only needs the chips it displays. Chips for icons in use need the map, which is small (70 SVG paths, a few KB).
- **Shared package status (checked 2026-10-17):** `packages/shared/src/categories.ts` already exports `CATEGORY_ICONS` (70 keys, the 13.4 order), `CATEGORY_COLOR_KEYS`, `CATEGORY_COLORS` (label, light, dark, group) and the `tag` and `slate` fallbacks. Its 14 hex pairs match 13.2 exactly. It does not yet hold icon labels or keywords; add them there as `CATEGORY_ICON_META` (below) rather than in the web app.
- **Labels and keywords:** each key has an authored label ("Shopping cart") and 3 to 6 keywords in `packages/shared`, for example `shopping-cart`: groceries, store, buy, supermarket. Search is a case-insensitive substring match over label and keywords. Authoring is content work (see 17, C-13).
- **Display sizes:** 14 / 18 / 22px inside chips of 24 / 32 / 40px. Picker cells show the bare icon at 20px.
- **Fallback:** an unknown stored key renders `tag`; the edit dialog preselects nothing and shows the notice "This icon is no longer available. Choose another." so the user can repair it. Same for an unknown color (`slate`, notice "This color is no longer available.").

#### 18.2.5 List and the system versus custom distinction

Desktop (1024 and up, two columns; each column is its own `section` with an `h2`):

```
+-----------------------------------------------------------------------------------------------+
| Categories                                                              [ Create category ]    |
+---------------------------------------------+-------------------------------------------------+
| Expense (24)                                 | Income (8)                                      |
|  Yours (2)                                   |  Yours (1)                                      |
|   [paw]   Pets                        [ .. ] |   [laptop] Side projects              [ .. ]    |
|   [book]  Courses                     [ .. ] |  Defaults (7)                                   |
|  Defaults (22)                               |   [brief]  Salary            (lock) Default     |
|   [cart]  Groceries          (lock) Default  |   [laptop] Freelance         (lock) Default     |
|   [house] Housing            (lock) Default  |   ...                                           |
+---------------------------------------------+-------------------------------------------------+
```

Below 1024: a `Tabs` list "Expense 24" / "Income 8" (selected tab has a 3px primary bottom edge and `aria-selected`, never color alone), one section visible at a time, sections inside keep "Yours" first. Mobile rows are 48px with the same anatomy; the Create category button sits under the title at full width and presets the visible tab's type.

| Aspect | Custom ("Yours") | Default (system) |
| --- | --- | --- |
| Section | Heading "Yours (n)" first in each type | Heading "Defaults (n)" after it |
| Mark | none | `Lock` icon (14px, `ink-3`) **and** the word "Default" in `ink-3` caption text (5.78:1 on `surface`, 5.09:1 on `primary-tint`). Icon alone is never used |
| Row action | Row opens `/categories/$id/edit`. Overflow menu: Edit, Delete | Row opens the read-only `CategoryDetailDialog`. **No overflow menu** (nothing to offer) |
| Detail | Editable form | Chip, name, type, and the line "Default categories are managed by the Midas administrator and can't be changed or deleted." plus a link **Create your own category** that opens the create dialog |
| Name collisions | A user may create "Groceries" while a default "Groceries" exists (contract allows it) | Unchanged |
| In pickers (transaction form, filters, budgets) | Listed with its chip | Same chip. When a user category and a default share a name, both options get a muted suffix: "Groceries (yours)" and "Groceries (default)" so they are distinguishable by text, not only by icon or color |
| Screen reader | "Pets, expense category" | "Groceries, expense category, default, read only" |

Counts in headings exclude retired defaults (the list request does not ask for them). Rows with long names truncate with an ellipsis at one line (names are 1 to 40 characters) and the full name is in the dialog.

#### 18.2.6 Create and edit dialog; picker interaction

Dialog 520px on desktop, sheet on mobile. The `CategoryPreview` is the first element and stays at the top of the dialog body (`sticky top-0 bg-raised`) while the sheet scrolls, so the result is visible while choosing an icon far down the grid.

```
+------------------------------------------------------+
| Create category                                  [x]  |
| +--------------------------------------------------+ |
| | Preview   [ paw ] Pets                           | |   sticky
| +--------------------------------------------------+ |
| Name *                                                |
| [ Pets                                  ]    4 / 40   |
| Type *     ( Expense | Income )                       |
| Color                                      Teal       |
| [#][#][#][#][#][#][#]     14 swatches, 36px, 7 / row  |
| [#][#][#][#][#][#][#]     (selected has check + ring) |
| Icon                                  Paw print        |
| [ Search icons                          ]  (12 icons) |
| Money and work                                        |
| [o][o][o][o][o][o][o][o][o]                           |
| Home and bills                                        |
| [o][o][o][o][o][o][o][o][o]                           |
| ...                                                   |
| [ Cancel ]                         [ Create category ]|
+------------------------------------------------------+
```

**Fields**

| Field | Control and rules |
| --- | --- |
| Name | `Field`, 1 to 40 characters, trimmed, `autocomplete="off"`. Counter visible, announced from 35 |
| Type | `Segmented` (Expense, Income) on create, default from the opening context. Read-only text with the helper "Type can't be changed." on edit. Changing type on create before touching the color recomputes the suggested color |
| Color | `ColorPicker` (below). Default is the first Core color not yet used by this user's categories of the same type, wrapping after eight (13.3). Edit: the saved color |
| Icon | `IconPicker` (below). Default on create: `tag`, shown selected, with the prompt "Choose an icon" so it is clear it is a placeholder. Edit: the saved icon |

**`ColorPicker`**

- `fieldset` with a visible legend "Color" and, on the same line at the end, the selected color's written label ("Teal"). Each swatch is a native radio (`sr-only peer`) with a `label` containing the sr-only color name; the `<label>` is the visual.
- Grid: `grid-cols-[repeat(auto-fill,minmax(2.25rem,1fr))]` on fine pointers, `minmax(2.75rem,1fr)` on coarse pointers, gap 8px. At 280px of dialog content on a 320px phone that is 5 per row over 3 rows; on desktop 7 per row over 2 rows. Order: the 8 Core colors, then the 6 Extended (13.3), so the first row is always safe to pick from.
- Swatch states:

| State | Visual |
| --- | --- |
| Default | 36px (44px coarse) rounded square (8px radius) filled with the color. No border needed (3.99:1 or more against `raised`) |
| Hover | 2px outer ring in `line-strong` (3.75:1 light, 3.41:1 dark on `raised`). A tooltip with the color name appears (supplementary only, because the name is also written next to the legend) |
| Focus-visible | The global 2px `ink` ring, 2px offset |
| Selected | `inset-ring-2 inset-ring-ink` plus a centered 18px check glyph (white light, `#04201A` dark; 18.2.3). Check and ring are shape cues, so selection never depends on hue |
| Disabled | Not used. Every color is always available (colors may repeat between categories) |

- Keyboard: Tab enters the group once (on the checked swatch), arrow keys move to the next or previous swatch in reading order and select it (native radio behavior; Down behaves as Right and Up as Left), Tab leaves the group. The preview chip updates immediately on selection. No separate confirm step.
- Selecting announces nothing extra: the radio change already announces "Teal, radio button, 3 of 14, checked".

**`IconPicker`**

- Search: `<input type="search">` with the visible label "Search icons", `autocomplete="off"`, `spellcheck="false"`, `enterkeyhint="search"`. Filtering is instant on 70 items. A visually hidden polite region announces "{n} icons" after 400ms of idle typing, and "No icons match {query}" for zero. Esc with text in the field clears it and stops propagation; with an empty field Esc bubbles and closes the dialog.
- Grid: one `fieldset` with legend "Icon". Inside it, group headings (`h3`, `body-sm` weight 600, sentence case) from 13.4 followed by a grid `repeat(auto-fill, minmax(2.5rem, 1fr))` (2.75rem on coarse pointers). Groups with no search match are removed from the DOM; all icon radios share one `name`, so the whole picker is **one tab stop** regardless of grouping.
- Cell states:

| State | Visual |
| --- | --- |
| Default | 40px (44px coarse) cell, 20px icon in `ink-2` (8.10:1 light, 8.55:1 dark on `raised`), transparent background. Icons are neutral at rest so the grid does not become a rainbow and color is chosen separately |
| Hover | `sunken` background, tooltip with the label |
| Focus-visible | Global 2px `ink` ring |
| Selected | Background is the chosen color's chip tint, the icon takes the chosen color (3.41:1 or better), plus `inset-ring-2 inset-ring-ink`. It previews exactly what the chip will look like |

- The selected icon's label is written in the legend row ("Icon: Paw print") so state is visible without scanning the grid, even when a search hides the selected cell.
- Keyboard: Tab into the group (lands on the checked cell), arrow keys move and select in reading order across group boundaries, Tab leaves. Home and End are not provided (the browser does not map them for radios); the search field is the fast path for 70 icons.
- Empty search result: the grid area shows "No icons match "xyz"." and a **Clear search** button; the selected icon remains selected.
- Reduced data: the icon list is static, there is no network request.

**Validation and behavior:** Enter in the name field submits. Create button label **Create category**, edit **Save changes**. A dirty close asks "Discard this category?". Success closes the dialog, highlights the new row (1.2s) in its section, focus goes to the row, polite status "Category created." No toast.

#### 18.2.7 Delete flow

`DeleteCategoryDialog` is one `ConfirmDialog` that changes content in place, so focus and the dialog do not flicker. It is offered only for user categories.

| Step | Content | Focus | Buttons |
| --- | --- | --- | --- |
| 1. Confirm | Title "Delete Pets?". Body: "Budgets that use it are deleted too. If transactions or recurring transactions use it, you'll choose where to move them next." Reversibility: "This can't be undone." | Cancel | Cancel, **Delete category** (danger) |
| (request) | The client sends `DELETE /categories/{id}` without `reassignTo`. A category that is unused succeeds here | Button loading | |
| 2. Reassign (only after `409 CATEGORY_IN_USE`) | Title "Move Pets to another category". Body: "Some transactions or recurring transactions use Pets. Choose where to move them." `Combobox` "Move to" listing non-retired categories of the **same type** excluding itself, defaults and own, with the disambiguating suffixes from 18.2.5. Consequence line: "Budgets for Pets will be deleted." | The combobox | Back (returns to step 1 without a request), **Delete and reassign** (danger, `aria-disabled` with the helper "Choose a category to continue." until a target is set) |
| Result | Toast (information, 10s, `role="status"`): "Pets deleted. Moved 42 transactions and 1 recurring transaction. Deleted 1 budget." Zero counts are omitted. | Next row in the section | |

Errors: `REASSIGN_TARGET_INVALID` on the combobox ("That category can't be used. Choose another." and the list refetches); `NOT_FOUND` closes the dialog with the status "That category no longer exists."; `SYSTEM_CATEGORY_READ_ONLY` (a stale tab) closes the dialog and opens the read-only detail; `5xx` and network errors keep the step and input. Showing counts before commit needs DN-2 (v1.1).

#### 18.2.8 States and error mapping

| State | Presentation |
| --- | --- |
| Loading | Two column skeletons (6 rows each at 48px), `aria-busy`. Chips render as 32px skeleton squares |
| Empty "Yours" | Inline note under the "Yours" heading: "You haven't created categories. Defaults cover most spending." and a text button **Create category**. The page is never empty because defaults exist |
| Error (load) | Inline Alert with **Try again** in place of the lists. Header stays |
| Unknown icon or color | Fallback chip, repair notice in the edit dialog (18.2.4) |
| Retired default (existing data) | Shown wherever old data references it as chip + name + muted "Retired". Not listed on this page. Picking it is impossible |
| Limit | `LIMIT_REACHED`: form alert "You've reached the limit of 200 categories." |
| Name taken | `CATEGORY_NAME_TAKEN`: field error "You already have an expense category with this name." |
| Rate limited, network, 5xx | As 18.0.3 |

#### 18.2.9 Keyboard and ARIA summary

- Page landmarks: `h1` Categories, each type section an `h2` ("Expense", "Income") with its count in the accessible name. Below 1024 the tablist labels are "Expense, 24" and "Income, 8"; arrow keys move between tabs (roving tabindex, automatic activation), the panel is focusable only if it has no focusable content.
- Rows: the row link has the accessible name "{name}, {type} category" plus ", default, read only" for system rows. The overflow menu button is "Actions for {name}".
- Dialog tab order: close, name, type, color group, icon search, icon group, footer buttons. Esc closes (or clears the search first). Focus returns to Create category or the row menu trigger.
- Hover is never required: tooltips duplicate visible text; touch users read the written "Selected" label.
- Touch targets: swatches and icon cells are 44px with an 8px gap on coarse pointers.
- Motion: none beyond the 140ms hover fade and the row highlight. Reduced motion removes both.

---

### 18.3 Transactions: list, filters, quick-add and full form (E5-F1-S2)

#### 18.3.1 Frame

| | |
| --- | --- |
| User and job | Capture: "log what I just spent in under 15 seconds", often on a phone. Review: "find that purchase" and "what happened last week", at a desktop |
| Primary actions | Add a transaction (capture), find a transaction (search and filter). Capture wins the page: the quick-add bar sits above the filters |
| Attention path (desktop) | Quick add, then the search field, then the first day group of the ledger. Amounts form the right edge |
| Success measures | Quick-add: amount to saved in 6 interactions or fewer for a repeat category (type amount, Tab, pick recent category, Tab, Enter). Find: any entry reachable by search plus at most two filters |
| Emotional state | Capture should feel frictionless and certain ("did that save?"). Review should feel exact and unhurried |

#### 18.3.2 Routes, URL state, data and component map

| URL | Behavior |
| --- | --- |
| `/transactions` | `TransactionsPage` |
| `?compose=expense\|income\|transfer` | Opens the composer on **any** `_app` route. A `ComposerHost` mounted in `AppShell` reads this typed search param, so Add from the dashboard or budgets opens the drawer over the current page and closing returns to it (the user is not moved to the ledger) |
| `?tx=<transactionId>` | Opens the detail and edit view of one transaction (or the transfer form when the row is a transfer leg) on any `_app` route. Dashboard "Recent activity" rows use it |
| `/transactions/new`, `/transactions/$id` | Kept as deep links from 4.2. They redirect (replace) to `/transactions?compose=expense` and `/transactions?tx=$id`. This refines the overlay-route rule in 4.2 so overlays can sit on any page |

Opening an overlay pushes a history entry, so the browser Back button closes it. Closing from the UI pops that entry when the overlay was opened in this session and replaces it otherwise (a pasted link).

**List filter parameters** (zod-validated `validateSearch`; defaults are omitted from the URL):

| Param | Type | Default | API parameter |
| --- | --- | --- | --- |
| `from`, `to` | `LocalDate` | none ("All dates") | `from`, `to`. `to` before `from` is dropped with a status message |
| `wallet` | uuid, repeatable | none | `walletId` (repeatable) |
| `category` | uuid, repeatable | none | `categoryId` (repeatable) |
| `type` | `income\|expense\|transfer`, repeatable | none (all) | `type` (repeatable) |
| `q` | string, 1 to 100 after trim | none | `q` |
| `min`, `max` | integer minor units | none | `minAmountMinor`, `maxAmountMinor`. Only valid with a single-currency scope, see 18.3.5 |
| `sort` | `date_desc\|date_asc\|amount_desc\|amount_asc` | `date_desc` | `sort` |

Density is a local preference (3.7), not a URL parameter; this narrows the `density` entry in 4.2. URLs never contain names, notes or ids other than opaque uuids; `q` and thresholds are search criteria the user typed (flagged in 18.4). Invalid parameters are ignored, and a single polite status says "Some filters in the link weren't valid and were ignored."

**Data:** `useInfiniteQuery(['transactions', filters])` with `limit=25`, manual `fetchNextPage`, aborted when filters change. `useQuery(['wallets'])` and `useQuery(['categories', { includeRetired: true }])` feed pickers and filters (composer pickers filter out archived and retired client-side). A separate `['transactions','recent']` query (limit 100, date_desc, 5 minute stale time) supplies recent categories and the default wallet for quick-add (DN-13). No financial data is persisted locally; the last-used wallet id is a UI preference in local storage keyed by user id.

```
TransactionsPage
  PageHeader "Transactions"        [Export CSV] [Density v]
  QuickAddBar (lg+, has an active wallet)
  TransactionToolbar
    SearchField  FilterPopover x5 (Dates, Wallets, Categories, Type, Amount)  SortSelect
    ActiveFilters (FilterChip x n, Clear all)
  ResultStatus (live region)  ListRegion (aria-busy while refetching)
    TransactionList > DayGroup (h3 sticky) > TransactionRow | TransferRow
    ListFooter: LoadMoreButton | EndOfList | transfer note
  TransactionsEmptyState | TransactionsErrorState | TransactionsSkeleton
ComposerHost (AppShell)  Drawer/Sheet
  TransactionForm (expense, income)  |  TransferForm
  ReadOnlyTransaction (archived wallet)   DeleteTransactionDialog   DiscardChangesDialog
```

#### 18.3.3 Ledger layout

Desktop at lg (1024) to xl; rail 232px so the content column is about 744px at 1024 and 984px at 1280. Layout is driven by the **list container** width (CSS container query), not the viewport.

```
+------------------------------------------------------------------------------------------------+
| Transactions                                                  [ Export CSV ]  [ Density: Comf v ] |
+------------------------------------------------------------------------------------------------+
| Quick add                                                                                      |
|  (Expense|Income|Transfer)                                                                     |
|  Amount        Category              Wallet           Date              Note        [Add expense]|
|  [ $ 0.00 ]    [ Search...      v]   [ Checking   v]  [ 16 Oct 2026 ]   [        ]               |
+------------------------------------------------------------------------------------------------+
| [ Search notes            x]  [All dates v] [Wallets v] [Categories v] [Type v] [Amount v]  Sort [Newest v] |
| [Groceries x] [Checking x] [Expense x]                                              Clear all   |
+------------------------------------------------------------------------------------------------+
| 25 transactions shown, more available                                      (live region)        |
+------------------------------------------------------------------------------------------------+
| Fri 16 Oct                                                                       (sticky h3)   |
|  [cart]   Weekly shop at the market      Checking     Groceries            -$54.20        [..] |
|  [brief]  Salary                         Checking     Salary            +$4,200.00        [..] |
| Thu 15 Oct                                                                                     |
|  [swap]   Transfer to Savings            Checking     -                   -$200.00        [..] |
|  [swap]   Transfer from Checking         Savings      -                   +$200.00        [..] |
| ...                                                                                            |
|                              [ Load more ]        Showing 25                                   |
|             Transfers aren't counted as income or expenses.                                    |
+------------------------------------------------------------------------------------------------+
```

**Row grid.** `TransactionRow` is a `li` containing a CSS grid. A `@container` on the list switches templates:

| Container width | Template | Notes |
| --- | --- | --- |
| 45rem (720px) and up | `[chip 2rem] [description 1fr, min 12rem] [wallet 9rem] [category 10rem] [amount 9.5rem] [menu 2.5rem]` | Single line, 56px (44px compact). Wallet and category columns truncate with ellipsis, full text in the detail view |
| Below 45rem | `[chip 2rem] [stack 1fr] [amount auto] [menu 2.5rem]`; the stack is description on line 1, "Category - Wallet" on line 2 in `caption` `ink-2` | 64px. Description and line 2 truncate. At container widths under 22.5rem (a 320px phone) the amount drops to its own right-aligned third line so digits never truncate |
| 2xl viewport | List column 60%, persistent detail panel 40% (6.4). The selected row is `primary-tint` with the 3px primary edge and `aria-current="true"` | The panel replaces the drawer on this route only; `?tx=` still addresses it |

Amount column widths are sized for `+$1,000,000,000,000.00` (about 13rem in the worst case). Realistic values fit 9.5rem; above that the column grows and the description shrinks. Digits never wrap or truncate.

**Row content and states**

| Element | Rule |
| --- | --- |
| Description | The note when present, otherwise the category name, otherwise (transfer) "Transfer to {wallet}" or "Transfer from {wallet}". Notes are rendered as text. Search matches are wrapped in `<mark>` styled `font-semibold` with an underline in `primary` (the underline carries the meaning, not just a fill) |
| Chip | `CategoryChip` md. Retired category: chip plus muted "Retired" in the detail view. Transfer: neutral chip with `arrow-left-right`. Recurring: a small `repeat` glyph after the description plus "Recurring" in the accessible name and a tooltip |
| Amount | `Amount` with sign mode `always`. Expense: `ink`, true minus. Income: `income` token, plus sign (6.32:1 light, 9.39:1 dark on `surface`). Transfer out and in: `ink-2` with sign. Other currency than the preference: code suffix. Masked when Hide amounts is on |
| Wallet in archived state | Wallet name in `ink-2`, small `Lock` glyph and "Archived" caption. The row stays a link to the read-only detail (18.3.7) |
| Row link | The description is the single `<a>` (to `?tx=<id>`) with a stretched pseudo-element covering the row (`after:absolute after:inset-0`); the menu button sits above it (`relative z-[1]`). One link per row, large click target, correct semantics, no nested interactive elements |
| Menu | `TransactionRowMenu`: Edit, Duplicate, Delete. Trigger name: "Actions for {description}". For transfer legs the items read "Edit transfer", "Duplicate transfer", "Delete transfer". In an archived wallet: Duplicate only, plus a disabled text item "Edit and delete are unavailable while Old savings is archived." |
| Hover, active | Background `sunken` at 40% on hover, `sunken` at 70% while pressed. No movement |
| Focus-visible | The global ring is drawn around the whole row via `focus-visible:after:outline` on the stretched link, 2px `ink`, offset -2px so it is not clipped by the container |
| Selected (2xl) | As above |
| New (just added) | 1.2s highlight (`primary-tint` fading), or the static 2px left rule with reduced motion |
| Loading | Skeleton rows at the real height |

**Day groups.** `DayGroup` is a `section` with `aria-labelledby` pointing at its sticky `h3` ("Today", "Yesterday", "Fri, 16 Oct"; year added outside the current year). Sticky `top` equals the app header height (z 10) and the global `scroll-padding-top` already keeps focused rows from hiding behind it. When sorted by amount there are no groups and each row shows its date in the secondary slot ("16 Oct").

**Semantics.** `ul` of `li`, each row's accessible description reads like the sentence in 10.4: "Expense, Groceries, Checking, 16 October, minus $54.20" through a visually hidden span. A first, focusable-on-demand link "Skip to end of list" precedes the list (visible on focus) so keyboard users with 100 loaded rows can reach Load more in one step. Density `compact` uses 44px rows, the same grid and no other change.

Tablet (768 to 1023): no quick-add bar, the header **Add** opens the drawer. The list is in the below-720 template while the content column is narrower than 720px (that is the case at 768 with the icon rail) and switches to the table template when there is room.

Mobile (below 768): the toolbar is the search field and a **Filters (n)** button (sheet), then active chips. The list uses the two-line template.

```
+-----------------------------------+
| Transactions        [ Filters (3) ]|
| [ Search notes               x ]  |
| [Groceries x] [Checking x] [Exp x]|
| 25 transactions shown, more avail.|
+-----------------------------------+
| Fri 16 Oct                        |
| [cart]  Weekly shop at the m...   |
|         Groceries - Checking      |
|                         -$54.20   |
|         (amount on line 1 when    |
|          the row is >= 360px)     |
| [brief] Salary                    |
|         Salary - Checking         |
|                      +$4,200.00   |
|        [ Load more ]              |
+-----------------------------------+
| Home | Activity | [ + ] | Budgets | More |
+-----------------------------------+
```

#### 18.3.4 Quick-add bar

`QuickAddBar` is a `form` landmark (`aria-label="Quick add"`) rendering the shared `TransactionForm layout="bar"` or `TransferForm layout="bar"`. It exists from `lg` up when the user has at least one active wallet; below that the Add button opens the composer.

| Container width | Layout |
| --- | --- |
| 56rem (896px) and up | Row 1: "Quick add" label and the type `Segmented`. Row 2: Amount 8rem, Category 12rem, Wallet 10rem, Date 9rem, Note flexible (min 10rem), submit 8.5rem |
| 40rem to 56rem | Row 2 wraps to two lines: Amount, Category, Wallet; then Date, Note, submit |
| Under 40rem | Bar not rendered; the header **Add** is the entry |

All fields have persistent visible labels (`label` style). The bar uses the same controls as the composer, so behavior and error mapping are identical (18.3.7).

| Mode | Fields in order | Submit label |
| --- | --- | --- |
| Expense (default) | Amount, Category (expense categories), Wallet, Date, Note | **Add expense** |
| Income | Amount, Category (income categories), Wallet, Date, Note | **Add income** |
| Transfer | From, To (with swap), Amount, They receive (only when currencies differ, appears as an extra field in row 2), Date, Note | **Move money** |

Behavior:

1. **Defaults.** Type Expense. Wallet is the last-used wallet if it is still active, otherwise the first active wallet by name. Date is today in the user's timezone. Category is empty: the Category listbox opens with a "Recent" group (up to 5 distinct categories of the current type from the recent query) before the full alphabetical list. A wrong silent default would corrupt budgets, so none is preselected.
2. **Keyboard.** Focus is in Amount when the page loads with no other target. Enter in Amount, Date or Note submits. Enter in the Wallet or Category field submits when its list is closed and the value is valid (the key handler calls `requestSubmit`); with the list open Enter selects the highlighted option instead. Ctrl or Cmd plus Enter submits from anywhere in the bar. The type segments are a native radio group (arrows change type, Tab leaves).
3. **Type switch.** Keeps Amount, Wallet, Date and Note. Clears Category and says so politely ("Category cleared. Categories differ by type."). Switching to Transfer maps Wallet to From.
4. **Submit.** The button shows loading and ignores repeats. Validation runs on submit, not while typing, except Amount which shows its format error on blur.
5. **Success.** The server returns 201. The list query is invalidated. Amount, Category and Note are cleared; Type, Wallet and Date are kept; focus returns to Amount. Category is cleared on purpose (as in 6.4): a stale category is the commonest silent mis-categorization, and the Recent group makes re-picking one keystroke away. The new row is highlighted if it appears in the list. A polite status reads "Expense added, $54.20, Groceries." If the new transaction does not match the current filters or sort (different wallet, date outside the range, amount sort), no row appears and the status adds a text button **Clear filters** so the user is not left wondering. Budget crossing messages follow 6.9.
6. **Failure.** Errors appear under the offending fields, focus moves to the first invalid field, and when two or more fields fail a `role="alert"` summary above the bar lists them as links to the fields. Server codes map as in 18.3.7. Input is preserved.
7. **No wallet.** The bar is replaced by an inline prompt with **Create wallet**. Transfer with fewer than two active wallets: the segment stays selectable, and the form area shows "Transfers need two wallets." with **Create wallet**.
8. **Disabled and loading.** While wallets or categories are still loading the bar renders with skeleton fields of the final heights, no layout shift, and the submit is `aria-disabled` with "Loading your wallets and categories."

States for each field follow 7.3. The bar shows no success toast (the row appears in place).

#### 18.3.5 Search, filters and sort

**Toolbar structure** (desktop). One search field, five filter popovers, one sort select, then the active-filter strip.

| Control | Component | Behavior |
| --- | --- | --- |
| Search | `SearchField`: `input type="search"` with a persistent visible label "Search notes" above it at every size (filter triggers align to the field's bottom edge, so the label adds one line to the toolbar), leading magnifier icon (`aria-hidden`), clear button named "Clear search" | Debounced 300ms, or immediately on Enter. Trims whitespace, ignores a query shorter than 1 character, caps at 100 (counter at 90). Esc clears a non-empty field. Matches the **note** text only (case-insensitive substring), which the helper line states: "Searches notes." When the typed text exactly equals a category or wallet name (client lists), a suggestion line below the field offers "Filter by category Groceries" and "Filter by wallet Checking" as buttons |
| Dates | `FilterPopover` "All dates" | Presets as a radio list: All dates, This month, Last month, Last 30 days, Last 90 days, This year, Custom. Custom shows two `DateField`s (From, To) with inline validation "End date must be on or after the start date." Presets resolve to concrete `from` and `to` in the URL. Trigger label shows the range ("1 Oct to 31 Oct 2026") |
| Wallets | `FilterPopover` "Wallets" | A `fieldset` of checkboxes: all wallets **including archived ones** (suffix "Archived"), because history stays visible. Trigger shows "Wallets" or "Wallets: Checking +1" |
| Categories | `FilterPopover` "Categories" | Text field "Filter categories" above a scrollable `fieldset` of checkboxes grouped Expense / Income / (Retired suffix). Up to 200 items, no virtualization. A "Selected" count is in the trigger |
| Type | `FilterPopover` "Type" | Three checkboxes: Expense, Income, Transfer |
| Amount | `FilterPopover` "Amount" | Min and Max `MoneyField`s with the currency adornment. Enabled only when the scope has one currency, see below |
| Sort | Native `<select>` "Sort" | Newest first, Oldest first, Highest amount, Lowest amount. When the user has more than one currency the select shows the helper "Amount sorts compare numbers as stored, not converted value." |

Popover trigger: `Button variant="secondary" size="sm"` with a trailing chevron, `aria-haspopup="dialog"`, `aria-expanded`. A trigger with an active filter gets a `primary` 2px bottom edge **and** the value text in its label (not color alone). The popover is a non-modal Radix Popover with `role="dialog"` and an accessible name, focus moves to its first control, Esc closes and returns focus to the trigger, Tab out closes it. Filters apply immediately as the user changes them (debounced 300ms to batch rapid clicks) and the popover offers **Clear** for its own filter. There is no Apply button on desktop because the results region updates in place (3.2.2 satisfied: the page does not navigate or change context).

**Currency-aware amount filter.** The API compares `minAmountMinor` and `maxAmountMinor` to raw minor units across all currencies, so the same number means different money in different currencies (1,000 minor units is USD 10.00 but JPY 1,000). The Amount popover is therefore enabled only when the scope resolves to exactly one currency: the user has wallets in one currency, or the Wallets filter selects wallets that all share one currency. Otherwise the trigger is `aria-disabled` and a visible reason is linked with `aria-describedby`: "Choose wallets in one currency to filter by amount." The popover shows the resolved currency code. See DN-15 for the proper fix.

**Active filters strip.** `ActiveFilters` renders one `FilterChip` per selected value (a category chip per category, a wallet chip per wallet) plus the date range, type values and amount range. The search text is not duplicated as a chip. Each chip is a `button` with the accessible name "Remove filter: Category Groceries"; activating it removes only that value and returns focus to the next chip, the previous chip, or the search field. **Clear all** appears when there are two or more chips and clears everything except sort and search (search has its own clear). A referenced wallet or category that no longer exists renders "Unavailable wallet" (removable) rather than failing.

**Mobile filter sheet.** `Filters (n)` opens a bottom sheet with the same controls stacked as `fieldset`s in this order: Dates, Type, Wallets, Categories, Amount, Sort. Changes are **staged**, not applied per tap, to avoid a request storm on a slow connection. The sticky footer has **Show results** (primary) and **Clear all** (secondary). Closing the sheet with Esc, the close button or the scrim discards staged edits. The `n` in the trigger counts applied filters, not staged ones.

**Updating results.** Search or filter changes keep the previous results visible with `opacity-60`, `aria-busy="true"` on the list region and a 2px indeterminate progress line at the top of the list (CSS animation, hidden by reduced motion in favor of a static "Updating..." caption). In-flight requests are aborted when filters change again. When results arrive a polite message states the outcome: "25 transactions shown, more available.", "3 transactions.", or "No transactions match these filters.". Focus stays where it was.

**Result count.** Cursor pages return no total. v1 states the number of loaded rows, with "more available" while `nextCursor` exists. Totals (matching count, income, expenses, net) are DN-1 and, when delivered, appear in this same status line.

#### 18.3.6 Pagination

- **Pattern:** an explicit **Load more** button (cursor-based, 25 per request). No infinite scroll (traps keyboard users, hides the end of the page).
- **Button:** secondary, full width of the list on mobile, centered with the "Showing 25" caption on desktop. Loading state: spinner, label stays, `aria-busy`, repeat activation ignored. It is a real button after the last row in DOM order.
- **Focus (refines 6.4):** after a successful load, focus moves to the first newly added row's link so keyboard and screen reader users continue reading downward instead of tabbing back up through 25 rows. The live region announces "25 more transactions loaded. 50 shown." If there is no next cursor, the button is replaced by the end-of-list line "You've reached the oldest transaction." (or "newest" when sorted ascending) and the same focus rule applies.
- **Failure on load more:** the button becomes an inline `Alert` in the footer: "Couldn't load more. Your list is unchanged." with **Try again**. Loaded rows stay.
- **`INVALID_CURSOR` (400):** treated as stale state. The list silently refetches from the first page and announces "The list was refreshed."
- **Large lists:** DOM size is controlled first with CSS only (`content-visibility: auto; contain-intrinsic-size: auto 56px` on each `DayGroup`), which keeps native find-in-page and focus order. Windowing is introduced only past about 200 loaded rows (6.4) and must preserve row semantics.
- **Sort or filter change:** resets to the first page (the cursor is bound to sort and filters).

#### 18.3.7 Full composer

Presented in the drawer (440px, right edge) at md and up, a full-height sheet below 768, and the persistent panel at 2xl on the ledger route. It uses the shared `TransactionForm` and `TransferForm`; the quick-add bar is the same form with `layout="bar"`.

**Header.** Title "Add transaction" (create), "Edit expense" or "Edit income" (edit, with created and updated dates in `caption`), "Edit transfer". Close button. Below it the type `Segmented`: Expense, Income, Transfer. In edit mode for an income or expense the segments are Expense and Income only (switching type is allowed and requires a category of the new type); a transfer shows no segmented control, only a "Transfer" label, because the API does not convert between a transfer and other types.

**Expense and income fields** (same layout, different category list and submit label):

```
+---------------------------------------------------+
| Add transaction                              [x]   |
| (Expense) (Income) (Transfer)                      |
| Amount *                                           |
| $ [ 0.00                    ]   USD  (Checking)    |
| Category *                                         |
| Recent: [paw Pets] [cart Groceries] [bus Transport]|
| [ Search categories...                        v ]  |
| Wallet *                 Date *                    |
| [ Checking  $1,180.00 v] [ 16 Oct 2026 ] [Today]   |
| Note (optional)                          0 / 500   |
| [                                              ]   |
| [                                              ]   |
| Make this recurring ->                             |
+---------------------------------------------------+
| [ Cancel ]                       [ Add expense ]   |
+---------------------------------------------------+
```

| Field | Control | Validation | Default and behavior |
| --- | --- | --- | --- |
| Amount | `MoneyField` (positive only), 28px on mobile, currency adornment from the wallet | Required. Greater than 0. At most the currency's decimals (JPY 0, USD 2, KWD 3) with an error instead of silent rounding. At most 1,000,000,000,000.00. Parse accepts pasted formatted values | Empty. Focus on open |
| Category | Recent chips (buttons with `aria-pressed`) plus `Combobox` | Required. Type must match (guaranteed by the list). A retired category is shown only if it is the current value of an edit | Empty on create. Recent chips are up to 4 of the current type, overflow "+n" focuses the combobox |
| Wallet | `Combobox` (up to 100 options) showing the name and the balance | Required. Active wallets only. Edit: if the current wallet is archived the whole form is read-only | Last-used wallet |
| Date | `DateField` with a Today button | Required. Valid `LocalDate` in 1900 to 2100. A future date shows an `info` line "This date is in the future." and is allowed | Today in the user's timezone |
| Note | `Textarea` 2 rows growing to 5, counter | Optional, at most 500. Counter always visible, announced at 450 and above | Empty |
| Make this recurring | Text link that opens the recurring form prefilled (type, amount, wallet, category, note) after confirming discard of unsaved edits | | Create mode only |

Changing the wallet to one with a different currency re-parses the amount; if it now has too many decimals the Amount field shows the error rather than changing the number. Amount, date and note survive any type switch. The category is cleared on a type switch with a polite status.

**Transfer fields** (`TransferForm`, submit **Move money**):

```
+---------------------------------------------------+
| Move money                                   [x]   |
| (Expense) (Income) (Transfer)                      |
| From wallet *                                      |
| [ Checking   $1,200.00                      v ]    |
|                              [ swap ]              |
| To wallet *                                        |
| [ Savings    $5,000.00                      v ]    |
| Amount *                                           |
| $ [ 200.00               ]   USD                   |
| They receive *     (shown only if currencies differ)|
| EUR [ 184.00             ]   About 1 USD = 0.92 EUR |
| Date *                                             |
| [ 16 Oct 2026 ] [Today]                            |
| Note (optional)                          0 / 500   |
| [                                              ]   |
| After this transfer                                |
|  Checking   $1,200.00 -> $1,000.00                 |
|  Savings    $5,000.00 -> $5,200.00                 |
+---------------------------------------------------+
| [ Cancel ]                        [ Move money ]   |
+---------------------------------------------------+
```

- **Swap** is an `IconButton` named "Swap From and To wallets" between the two wallet fields. It exchanges the two values.
- **Exclusion:** the To list marks the From wallet as unavailable ("selected as From"), and vice versa, using `aria-disabled` options. This makes `SAME_WALLET_TRANSFER` unreachable in the UI while the error mapping below still handles a race.
- **They receive** appears only when the two wallets' currencies differ, is required then, and is cleared (and removed) when the currencies match. The implied rate line is informational, rounded to 4 significant digits, and hidden until both amounts are valid. It never blocks submission.
- **After this transfer** preview: before and after balance for each wallet, a `dl` inside a polite live region, updated 300ms after the last edit. In edit mode "before" excludes the transfer being edited. If a non-card wallet would go below zero the line carries the Overdrawn badge and the text "This will leave Checking overdrawn." (information, not a block, since the product allows negative balances).
- Edit mode loads `GET /transfers/{id}` using the leg's `transferId`. Editing either leg edits both.

**Validation messages (structural):** Amount "Enter an amount greater than 0." / "USD has 2 decimal places." / "Amount is too large."; Category "Choose a category."; Wallet "Choose a wallet."; Date "Enter a valid date."; Note "Keep notes under 500 characters."; To "Choose a different wallet."; They receive "Enter the amount they receive." Validation runs on submit and re-validates a field when it changes after an error.

**Server error mapping**

| Code | Where | Behavior |
| --- | --- | --- |
| `WALLET_ARCHIVED` (create, move, edit) | Wallet field (From or To for transfers) | "This wallet is archived. Choose another wallet." Wallets refetched. In edit mode when the transaction's own wallet is archived, the form is replaced by the read-only view below |
| `CATEGORY_RETIRED` | Category field | "This category is no longer available. Choose another." Categories refetched |
| `CATEGORY_TYPE_MISMATCH`, `INVALID_REFERENCE` | Form alert | "Some options changed. Check your choices." Wallets and categories refetched, fields that no longer exist cleared, input kept |
| `SAME_WALLET_TRANSFER` | To field | "Choose a different wallet." |
| `TO_AMOUNT_REQUIRED`, `TO_AMOUNT_MISMATCH` | They receive field | "Enter the amount they receive." |
| `TRANSFER_LEG_IMMUTABLE` | (opened a leg via a stale link) | The view switches to the transfer form for that transfer |
| `NOT_FOUND` | Form alert, then close | "This transaction no longer exists." The list refetches, focus returns to the list heading |
| `VALIDATION_FAILED` with `errors[]` | Field map: `amountMinor` to Amount, `occurredOn` to Date, `note` to Note, `walletId` / `fromWalletId` to Wallet / From, `toWalletId` to To, `categoryId` to Category, `toAmountMinor` to They receive | Unmapped entries go to the form alert |
| `RATE_LIMITED` | Form alert | Countdown from `Retry-After` |
| Network (outcome unknown) | Form alert | "We couldn't confirm this was saved. Check your recent transactions before adding it again." with a link to the list. Submit re-enabled |
| 5xx | Form alert with request id and Copy | Input kept |

**Read-only view for archived wallets.** When a transaction (or transfer) touches an archived wallet, the API rejects edits and deletes (`WALLET_ARCHIVED`). The drawer shows the details as a `dl` (type, amount, category, wallet, date, note) and an `info` Alert: "This transaction is in an archived wallet, so it can't be changed or deleted. Unarchive Old savings to edit it." with a link **View wallets**. Footer: **Duplicate** (opens the composer prefilled with an active wallet) and **Close**. No Delete button is shown.

**Recurring-generated transactions** show an `info` line in the edit header: "Added by a recurring transaction. Editing changes only this transaction." and the delete dialog adds the sentence from 5.6.

**Edit mode footer.** Left: text button **Delete expense** (or income, transfer), `danger` text, separated from Save by the whole row width. Right: **Cancel** and **Save changes** (disabled until dirty, reason in the helper line). Delete opens `ConfirmDialog` per 5.6 and, on success, closes the drawer, removes the row, announces "Expense deleted. Checking is now $1,180.00." and moves focus to the next row.

**Dirty close.** Esc, scrim or close with unsaved changes opens "Discard this transaction?" with **Keep editing** (default focus) and **Discard**. A pristine form closes immediately.

**Success from the drawer.** Closes, returns focus to the opener (Add button) or to the new row if it is visible, toast: "Expense added. Checking is now $1,180.00." with **View** (opens `?tx=`) and 8 seconds minimum. On a page that does not show the ledger (dashboard) the toast is the only on-screen confirmation, which is why it carries the number.

**Mobile sheet.** Full height, header with Close and the type segmented control (three 44px segments), the Amount field first and largest (28px, `inputmode="decimal"`, numeric keypad), recent category chips as a 4 column grid of 44px targets, a sticky footer with the submit button above the safe-area inset (Cancel becomes a text button under it). `enterkeyhint` is "next" on every field and "done" on the last one. Dynamic viewport units keep the submit visible above the on-screen keyboard.

#### 18.3.8 `Combobox` specification

Shared by Category, Wallet (composer), Currency (wallet form), reassign target and the filter lists where search helps.

- **Pattern:** WAI-ARIA 1.2 combobox with a list popup. The text `input` has `role="combobox"`, `aria-expanded`, `aria-controls` (listbox id), `aria-activedescendant` (the highlighted option id), `aria-autocomplete="list"`. The popup is `role="listbox"` with `role="option"` children and `aria-selected` on the committed value. Groups ("Recent", "Yours", "Defaults") use `role="group"` with `aria-labelledby`.
- **Keys:** Down or Up opens and moves the highlight (wrapping off), typing filters, Enter commits the highlighted option (and, when the list is closed and the value is valid, submits the form), Esc closes and keeps the typed text, Esc again restores the committed value, Home and End jump inside an open list, Tab commits nothing and moves on, Alt+Down opens.
- **Filtering:** case- and accent-insensitive substring over the name (client-side, at most 200 items). "No matches." state with the text of what was typed.
- **Option content:** `CategoryChip` (aria-hidden) and name, with the duplicate-name suffixes from 18.2.5; wallets show "Name" and the balance right aligned; options are 40px (44px coarse).
- **Value display:** the input shows the committed name as text; a leading `CategoryChip` adornment shows the icon (aria-hidden). On blur without a commit the input reverts to the committed value (no hidden free-text state).
- **Popup:** non-modal Radix Popover anchored under the input, matching its width, `max-height: min(20rem, 40dvh)`, focus stays in the input (`onOpenAutoFocus` prevented). It never injects styles (18.0.1).
- **States:** loading ("Loading..." row and `aria-busy`), error (message plus **Try again** inside the popup), empty list ("You have no categories of this type."), disabled, invalid (danger border and linked message).
- **Announcements:** a polite region says "{n} results" after the user stops typing for 400ms, and the highlighted option is announced through `aria-activedescendant`.

#### 18.3.9 Empty, loading and error catalog (transactions)

| Situation | Presentation |
| --- | --- |
| First load | Toolbar and quick-add render at once with skeleton fields if their data is pending. List shows 8 skeleton rows (56px), list region `aria-busy` |
| No wallets | The quick-add bar and the list area show the empty state "Create a wallet before adding transactions." with **Create wallet**. The header Add button still opens the composer, which shows the same state inside the drawer |
| Ledger empty (no transactions ever) | `EmptyState`: "Your ledger is empty." sentence about adding income or expense, **Add transaction** (opens the composer) and a text link **Create a recurring transaction**. The quick-add bar stays visible above it |
| Filters match nothing | "No transactions match these filters." with **Clear filters**, and a second line that names the most restrictive filter when it can be told (date range or amount), for example "Try a wider date range." Search-only: "No notes contain "xyz"." Filters and the search term stay editable |
| Filtered by archived wallet only | Same, plus the note "Archived wallets are included in the Wallets filter." |
| Page error (first load) | Inline `Alert` in the list region: "Couldn't load transactions. Check your connection and try again." with **Try again**; toolbar remains. 5xx shows the request id with Copy |
| Refetch error (filters changed) | The previous results stay (the dimming is removed), an Alert above the list says the update failed with **Try again** and **Revert filters** |
| Load more error | Footer Alert (18.3.6) |
| Invalid URL filters | Ignored with a status; chips only show valid values |
| Transaction detail not found | Drawer shows "This transaction doesn't exist or was deleted." with **Back to transactions**; focus on the heading |
| Offline | Global banner (11.1). Forms keep input and show the "unknown outcome" message if a submit was in flight |
| Export | States as 6.4 |
| Mutation toasts | Add: success toast with balance and **View** (composer only). Delete: status line. Errors never rely on a toast alone |

#### 18.3.10 Keyboard, ARIA and focus summary

- Landmarks: `h1` "Transactions"; quick add is a labeled `form`; the toolbar is a `search` landmark (`role="search"`) containing the search field and filters; the results region has an accessible name "Transactions" and `aria-busy` while updating.
- Tab order: Export, Density, quick-add fields, search, filter triggers, sort, active chips, Skip to end of list, rows (link then menu), Load more.
- Row actions are reachable and operable by keyboard (link, menu button), with no hover-only reveal. Touch: 44px menu targets, no swipe-only actions.
- Overlay focus: opens onto Amount (create) or the first field that failed validation; closes to the opener; after delete to the next row.
- Live regions: result count, "Expense added...", "{n} more loaded.", "Category cleared...", preview updates in the transfer form, filter-chip removals ("Filter removed: Category Groceries. 3 transactions.").
- Shortcuts: only Ctrl or Cmd plus Enter (submit) and Ctrl or Cmd plus K (palette); no single-key shortcuts (2.1.4).
- Hide amounts masks list amounts, wallet balances in pickers and the transfer preview; the quick-add Amount field itself shows what the user types.
- Reduced motion: no row fade, highlight becomes a static 2px rule, progress line becomes a static caption.

#### 18.3.11 Responsive and CSP checklist for implementers

- Container queries (`@container`, `@min-[45rem]`) govern the row template; viewport queries govern only the existence of the quick-add bar (lg) and the sheet versus drawer choice (768).
- No horizontal page scroll at 320px or 400% zoom. The list never uses a scrolling table.
- Every overlay and popover in this section passes the "no `<style>` node, no `style=` attribute" test of 18.0.1. Filter popovers, combobox listboxes and the drawer are non-modal.
- Money parsing and formatting live in `lib/money` (integer minor units only; never floats) and are shared by `MoneyField`, `Amount` and the transfer preview.
- Forms send `occurredOn` as a `LocalDate` string chosen in the user's timezone, never a timestamp.

---

### 18.4 Contract and data needs, and deviations found in earlier sections

#### 18.4.1 Handoff map

| Frontend story | Build from |
| --- | --- |
| E3-F1-S4 Wallets UI | 18.0, 18.1 (and 7.1 primitives in 18.0.2) |
| E3-F2-S2 Transfer UI | 18.3.7 `TransferForm`, 18.3.8 `Combobox`, 18.1.4 negative-balance rule (preview) |
| E4-F1-S4 Category UI | 18.0, 18.2 (palette in 13 and 18.2.3) |
| E5-F2-S3 Transaction form UI | 18.3.2 (`ComposerHost`), 18.3.4, 18.3.7, 18.3.8 |
| E5-F2-S4 Transaction list UI with filters | 18.3.2, 18.3.3, 18.3.5, 18.3.6, 18.3.9 |

Suggested build order for parallel work: primitives in 18.0.2 first (`ConfirmDialog`, `Segmented`, `RadioCardGroup`, `Switch`, `Combobox`, `MoneyField`, `DateField`, toast action), then `CategoryChip` and the color tokens (they unblock all three screens), then the three features.

#### 18.4.2 Persistence and data needs routed to db-agent and the architect

No new tables or columns are required by these designs. Client-only storage: last-used wallet id and list density, in local storage keyed by user id (never financial values). Search is the existing note substring search (DN-4 covers accent handling). No retention or deletion implications beyond the existing rules. The following additions improve the designs and extend 14:

| ID | Need | Why (screen) | Implication | Priority |
| --- | --- | --- | --- | --- |
| DN-15 | **Currency-aware amount filter and sort.** Add an optional `currency` parameter to `GET /transactions` and the export that restricts rows to wallets of that currency; amount sort should apply within it | Without it, `minAmountMinor` and `maxAmountMinor` compare unlike currencies. v1 gates the Amount filter to single-currency scopes (18.3.5) | Predicate on `transactions.currency` (the column exists per the Transaction model). `ix_transactions__user_date` still drives the plan; no new index expected, verify with EXPLAIN | v1.1. **contract** |
| DN-16 | **Wallet dependents.** Add `activeRecurringCount` (and a boolean such as `hasRecurringTemplates`) to `Wallet` | Archive dialog count, delete eligibility and currency lock currently depend on loading the whole templates list. `hasTransactions` alone predicts neither `WALLET_IN_USE` nor `WALLET_CURRENCY_LOCKED` (18.1.5, 18.1.9) | Cheap `COUNT`/`EXISTS` on `ix_recurring_templates__wallet_id` per returned wallet (at most 100) | v1.1 (v1 works from the cached templates list and handles the errors). **contract** |
| DN-17 | **Idempotency for creates.** Accept an `Idempotency-Key` header on `POST /transactions` and `POST /transfers` and return the original response for a repeated key within a short window (for example 24 hours) | Quick-add is fast and often used on poor connections. A response lost after the server commits makes the outcome unknown and a retry can duplicate a transaction (18.0.3). v1 mitigates with copy and a link to check recent items | Key plus request hash stored per user with a TTL (a small table or the existing cache layer); unique on (user, key). Needs an ADR | v1.1. **contract** |

Flagged for the frontend and security review (no design change needed): `q` (a typed search string) and `min` and `max` (user-chosen thresholds) appear in the URL and browser history so views are linkable (4.2). This is a deliberate narrowing of the 15.1 rule against amounts in URLs: ledger values, names and notes never appear in URLs; only search criteria the user typed do. If the product owner disagrees, move `q`, `min` and `max` into router state and keep only ids, dates, type and sort in the URL.

#### 18.4.3 Deviations found in earlier sections (corrected here)

| # | Earlier text | Issue | Resolution in this section |
| --- | --- | --- | --- |
| 1 | 7.1: `Select` is Radix Select, `Segmented` is Radix ToggleGroup | Radix Select mounts `react-remove-scroll` (injects a `<style>`), blocked by `style-src 'self'` (architecture R9, CONTRIBUTING.md) | Native `select` and native radio groups (18.0.1). The 7.1 rows are amended |
| 2 | 6.3 and 6.5 sample figures (hero $12,480.20 and wallet totals $10,480.20) | The two samples disagree with each other and with the wallet rows (1,180.00 + 9,200.00 + 100.20 − 2,400.00 = 8,080.20) | Rule defined in 18.1.3: total balance is the sum of active wallets per currency, cards net of money owed, matching `totalsByCurrency.balanceMinor`. Figures in wireframes are illustrative; tests and demo data must follow the rule |
| 3 | 6.5 archive text | Omits that archived wallets stop counting toward the total balance (the summary endpoint returns non-archived wallets only) and that unarchive does not resume recurring items | Added to the archive dialog and toast (18.1.7) |
| 4 | 6.5 delete rule uses `hasTransactions` alone | A wallet with recurring templates is also protected (`WALLET_IN_USE`), and currency can be locked by templates | Error paths and fallbacks added (18.1.5, 18.1.7, 18.1.9, DN-16) |
| 5 | 4.2 overlay routes `/transactions/new`, `/transactions/$id` | Add from the dashboard would navigate away from the page the user was on | `?compose=` and `?tx=` search params on any `_app` route, old URLs redirect (18.3.2) |
| 6 | 6.4: after Load more, focus stays on the button | Keyboard users would have to tab backwards through the new rows | Focus moves to the first new row (18.3.6) |
| 7 | 4.2 lists `density` as a URL parameter, 3.7 says it is local | Contradiction | Density is local only (18.3.2) |
| 8 | 6.6 icon picker: "primary ring and a check", roving tabindex | A custom roving grid adds code and failure modes; a primary-green ring collides visually with the green swatch | Native radios with an `ink` inset ring (18.2.6). Native arrow behavior replaces custom roving |
| 9 | 6.4 row actions imply every row is editable | The API rejects edit and delete on rows in archived wallets (`WALLET_ARCHIVED`), and on transfer legs individually (`TRANSFER_LEG_IMMUTABLE`) | Read-only view and menu variants (18.3.3, 18.3.7) |
| 10 | 13.2 ratio digits | Recomputed 2026-10-17: every value matches within 0.02 (rounding). No hex changed | 18.2.3 restates the ratios with the recomputed digits; 13.2 stays the source for hexes |

#### 18.4.4 Open questions

| # | Question | Impact | Default if unanswered |
| --- | --- | --- | --- |
| 8 | Is the `?compose=` and `?tx=` overlay model on any route acceptable to the architect (it changes the route table in 4.2 but not the URL contract)? | Router setup in E5-F2-S3 | Adopt as written; deep links still work |
| 9 | Should `q`, `min` and `max` live in the URL (18.4.2)? | Privacy posture of browser history and shared links | Yes, as designed |
| 10 | Should archiving a wallet with a non-zero balance ask the user to confirm that the balance leaves the total? | One more consequence line (already present) versus a stronger gate | Consequence line only |
| 11 | Should the Transactions page default to "This month" instead of "All dates"? | First view shows recent activity only; "find any entry" needs one more click | All dates, because search is the primary job and the first 25 rows are the newest anyway |

---

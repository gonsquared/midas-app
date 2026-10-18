# Midas — Project Brief

Midas is a personal finance web application that helps people track money, understand spending, and stay within budgets. It is a public, portfolio-quality codebase, so architecture, documentation, testing, and security should be demonstrably professional.

## Goals
- Let individuals record income and expenses across multiple wallets and see where their money goes.
- Give each user a clear dashboard: balances, recent activity, spending by category, budget progress, trends.
- Provide secure account management (registration, login, sessions, password reset).
- Provide an admin area for operating the product (user management, system oversight, audit trail).

## Roles
- **User**: manages own wallets, categories, transactions, budgets, and reports.
- **Admin**: everything a user can do for their own data, plus admin tasks: list/search/suspend/reactivate users, change roles, manage default (system) categories, view platform stats, view audit log. Admins cannot read users' private transaction details by default.

## Core features (scope for planning)
1. Authentication and accounts: register, login, logout, refresh/session handling, password reset, profile and settings (currency, locale, theme).
2. Wallets: multiple wallets (cash, bank, card, savings), balances, archive, transfers between wallets.
3. Transactions: create/edit/delete income, expense, transfer; notes, date, category, wallet; search, filter, pagination; CSV export.
4. Categories: default system categories plus user-defined; icons/colors; income vs expense types.
5. Budgets: per-category and overall budgets over a period (monthly default), progress and overspend warnings.
6. Dashboard and reports: balance summary, income vs expense over time, category breakdown, budget status, recent transactions, date-range selection.
7. Recurring transactions: scheduled templates that generate transactions.
8. Admin: user management, role management, default category management, platform metrics, audit log.
9. Cross-cutting: responsive UI, light/dark theme, accessibility (WCAG 2.1 AA), input validation, rate limiting, audit logging, observability basics.

## Out of scope for the first release
Bank-account syncing, multi-user shared wallets, receipt OCR, native mobile apps, payments/subscriptions.

## Constraints
- Planning phase only: no application code yet.
- Public GitHub repository, default branch `master`. No secrets, personal data, or internal references in any committed file.
- Documentation must read as a standalone product.
- Prefer a pragmatic, deployable stack (Docker for local dev, one-click-style deployment story, CI with lint/test/build).
- No git worktrees.

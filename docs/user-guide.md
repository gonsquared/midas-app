# Midas user guide

Midas is a personal finance tracker. You record income, expenses and transfers across your wallets, sort them into categories, plan spending with budgets, let regular items add themselves, and see where your money goes on a dashboard and in reports.

This guide describes every screen in the app. Names in **bold** are the labels you see on screen.

## Contents

1. [Getting started](#1-getting-started)
2. [Finding your way around](#2-finding-your-way-around)
3. [Profile and preferences](#3-profile-and-preferences)
4. [Wallets](#4-wallets)
5. [Categories](#5-categories)
6. [Transactions](#6-transactions)
7. [Transfers, including between currencies](#7-transfers-including-between-currencies)
8. [Searching, filtering and exporting](#8-searching-filtering-and-exporting)
9. [Budgets](#9-budgets)
10. [Recurring transactions](#10-recurring-transactions)
11. [Dashboard](#11-dashboard)
12. [Reports](#12-reports)
13. [Administration](#13-administration)
14. [Privacy and security](#14-privacy-and-security)
15. [Troubleshooting](#15-troubleshooting)

Screenshots live in [docs/images/](./images/) and are shown in the [README](../README.md#screenshots). The pictures are the real web app rendered against an in-memory fake API, so every name and amount is sample data, not a real account. Regenerate them with `CAPTURE_SCREENSHOTS=1 pnpm --filter @midas/e2e exec playwright test screenshots.spec.ts` (see `e2e/tests/screenshots.spec.ts`).

## 1. Getting started

### Create an account

1. Open Midas and choose **Create an account** on the sign-in page.
2. Enter your **Name**, **Email** and **Password**. A strength meter shows Weak, Fair, Good or Strong as you type. The password must be 12 to 128 characters and rated at least Good, so avoid common words.
3. Under **Regional defaults**, check your **Currency**, **Language and number format** and **Time zone**. They set the defaults for new wallets and budgets, how numbers and dates are shown, and what counts as today for you. You can change them later in Settings.
4. Choose **Create account**. You are signed in and taken to your dashboard.

A set of default categories is available immediately. If the email is already in use, the page tells you so and suggests signing in or resetting your password.

### Sign in and sign out

- Enter your email and password and choose **Sign in**. If either is wrong you see "Email or password is incorrect." The message is the same in both cases on purpose.
- If an administrator has suspended your account, you see "This account is suspended" and cannot sign in until it is reactivated. Contact the administrator of your Midas service.
- If you open a page while signed out, Midas sends you to sign in and returns you to that page afterwards.
- To sign out, open the account menu (your initials, top right) and choose **Sign out**. If Midas cannot reach the server while signing out, it tells you that you are signed out on this device but the server session may remain; on a shared device, sign in and out again once the connection is back.
- Your sign-in is renewed automatically while you use the app. If it expires you see "You were signed out. Sign in to continue."

### Reset a forgotten password

1. On the sign-in page choose **Forgot password?**.
2. Enter your email and choose **Send reset link**. For your privacy the page always says that if an account exists, a link has been sent. The link expires after 30 minutes. If it does not arrive, use **Send again** after the short wait shown.
3. Open the link, enter a **New password** and choose **Update password**. You are asked to sign in again with the new password, and every device that was signed in is signed out.
4. If the link has expired or was already used, you see "This link has expired or was already used." Choose **Request a new link**.

Too many attempts in a short time show a message asking you to wait and try again.

## 2. Finding your way around

On a desktop the navigation rail on the left lists:

| Group | Pages |
| --- | --- |
| Overview | Dashboard |
| Money | Transactions, Wallets, Budgets, Recurring |
| Insight | Reports |
| Setup | Categories |

Administrators also see an **Administration** group (see [section 13](#13-administration)). On a tablet the rail shrinks to icons with an expand control. On a phone a bottom bar shows **Home**, **Activity** (your transactions), an **Add** button in the middle and **Budgets**, and a **More** sheet holds Wallets, Recurring, Reports, Categories and Settings.

The **Add** menu offers **Expense**, **Income** and **Transfer**. The account menu (your initials) has **Settings**, a **Theme** choice (**Light**, **Dark**, **System**) and **Sign out**.

The whole app can be used with the keyboard. A skip link at the start of every page jumps to the main content, dialogs keep focus inside until you close them with Esc, and the page title is announced when you move between pages. Colour is never the only way a state is shown: budget and balance states also have text and icons.

## 3. Profile and preferences

Open **Settings** from the account menu. It has three sections.

**Profile.** Change your **Display name** and choose **Save changes**. Your email is shown but cannot be changed yet.

**Preferences.**

- **Theme**: Light, Dark or System (follows your device). It applies right away and is saved to your account.
- **Currency**: the default for new wallets and budgets. Existing data keeps its own currency.
- **Language and number format**: how numbers, currency amounts and dates are written. Screen text is English.
- **Time zone**: decides which calendar day is "today" for you, for example for recurring transactions and budgets.

Choose **Save changes** to store currency, language and time zone. A "Saved" message confirms it.

**Security.** To change your password enter your **Current password** and a **New password**, then choose **Change password**. Other devices are signed out and you stay signed in here.

## 4. Wallets

A wallet is a place where money is held. Each wallet has one currency. Open **Wallets** to see them with their balances and a total per currency.

### Create a wallet

Choose **Create wallet** and fill in:

- **Name**: unique among your active wallets. A duplicate shows "You already have a wallet with this name."
- **Type**: **Cash** (physical money), **Bank** (checking or current account), **Card** (credit or debit; below zero means you owe) or **Savings** (money set aside).
- **Currency**: the currency of every amount in this wallet.
- **Opening balance**: what was in the wallet before your first transaction. Use a minus sign for money owed. A wallet below zero shows as **Overdrawn**.

A wallet balance is always its opening balance plus all its transactions, so it never needs to be edited by hand.

### Change, archive or delete a wallet

Use the **Actions** menu on a wallet row.

- **Edit wallet**: change the name, type or opening balance. The currency cannot be changed once the wallet has transactions.
- **Archive wallet**: hides the wallet from pickers and pauses its recurring transactions. Its history stays in your transactions and reports. Archived wallets are hidden by default; use **Show archived** to see them, then **Unarchive wallet** to bring one back. Its recurring transactions stay paused until you resume them. If another active wallet has the same name you must rename one first.
- **Delete wallet**: only possible for a wallet with no transactions, and not while recurring transactions use it. For anything else the menu explains that deletion is unavailable and offers archiving instead.

While a wallet is archived you cannot edit or delete its transactions.

## 5. Categories

Categories sort your transactions into types of spending or income. Open **Categories**. They are listed under two tabs, **Expense** and **Income**, in two groups:

- **Defaults**: provided by Midas for everyone. You can look at them but not change them.
- **Yours**: categories you create.

### Create and edit your own categories

Choose **Create category** and give it a **Name**, a **Type** (Expense or Income), an icon and a colour. The preview shows how it will look. Use the **Actions** menu on a row for **Edit category** or **Delete category**.

### Delete a category

Choose **Delete category** and confirm. Budgets that use the category are deleted with it. If transactions or recurring transactions use it, Midas asks where to move them (**Move to**, a category of the same type) and then **Delete and reassign**. A summary tells you how many items were moved.

Administrators can retire default categories. A retired category stays on the transactions that already use it but cannot be picked for new ones.

## 6. Transactions

A transaction is one income or expense on a date, in one wallet. Open **Transactions** to see the list, newest first. Each row shows the category, wallet, note and amount. On narrow screens each row shows the description with the wallet and date underneath and the amount on the right; on wider screens the wallet, category and amount get their own columns. A transaction created by a recurring item shows a repeat icon next to its description. With no note, a transfer is described as "Transfer to" or "Transfer from" the other wallet.

### Add a transaction

There are three ways:

- Use the **Add** menu (top bar, or the centre button on a phone) and choose **Expense** or **Income**.
- Use the quick add bar at the top of the Transactions page: choose the type, then fill in the fields.
- **Duplicate** an existing transaction from its **Actions** menu to start from a copy.

The form asks for:

- **Amount**: in the currency of the chosen wallet.
- **Wallet**: where the money comes from or goes to. Archived wallets cannot be chosen.
- **Category**: only categories of the matching type are offered. If you switch the type, an incompatible category is cleared and Midas tells you.
- **Date**: defaults to today. A date in the future is accepted with the note "This date is in the future."
- **Note (optional)**.

If you have no wallet yet, Midas asks you to **Create wallet** first.

### Change or delete a transaction

Use **Actions** on the row, then **Edit** (the fields above) or **Delete**. Deleting always asks you to confirm and tells you the resulting balance. Wallet balances update immediately and exactly. You cannot edit or delete a transaction while its wallet is archived.

## 7. Transfers, including between currencies

A transfer moves money between two of your own wallets. It is not income or expense, so it does not change your totals for the period.

1. Choose **Transfer** from the **Add** menu (or the quick add bar).
2. Pick **From wallet** and **To wallet**. They must be different. The swap button exchanges them.
3. Enter the **Amount** (in the currency of the From wallet) and the **Date**, and optionally a **Note**.
4. If both wallets use the same currency you are done. If the currencies differ, a **They receive** field appears: enter the amount that actually arrives in the destination wallet. Midas shows the rate this implies, for example "About 1 USD = 0.92 EUR". Midas never converts currencies for you or looks up exchange rates.
5. A preview shows the effect on both wallets, and flags a wallet that would become **Overdrawn**. Choose **Move money**.

A transfer appears as two rows in the list, one in each wallet. Editing or deleting either row edits or deletes the whole transfer ("Both wallets change and both rows are removed").

## 8. Searching, filtering and exporting

On the **Transactions** page:

- **Search notes** finds transactions whose note contains your text (up to 100 characters, not case sensitive).
- **Filters** narrows the list by:
  - **Wallets** (archived wallets appear in their own group) and **Categories**.
  - **Type**: Expense, Income or Transfer.
  - **Dates**: **All dates**, **This month**, **Last month**, **This year**, or a **From** and **To** range.
  - **Amount**: **Minimum** and **Maximum**. This needs wallets in one currency; choose them first.
  - **Sort**: **Newest first**, **Oldest first**, **Highest amount** or **Lowest amount**.
- The active filters are shown as chips; remove one, or choose **Clear filters**. If nothing matches, Midas suggests removing a filter or widening the dates.

The list shows a page of transactions at a time. Choose **Load more** to see further rows; at the end Midas tells you that you have reached the oldest (or newest) transaction.

### Export to CSV

Choose **Export CSV** to download exactly what the list currently shows, including your filters. The file is a CSV that opens in spreadsheet programs. Each row has the date, type, direction (in or out, for transfers), wallet, currency, signed amount, category, note, the other wallet for transfers and identifiers. Text that a spreadsheet could mistake for a formula is made safe by a leading apostrophe. Exports are limited to a few per minute; if you see "You have exported a lot just now" wait a minute and try again. The Reports page has an export for its date range as well.

## 9. Budgets

A budget is a spending limit for a period. Open **Budgets**. Budgets are shown in two groups: **Needs attention** (exceeded, then nearly exceeded) and **On track**. Each budget has a meter with the amount spent, the limit and what remains, and the state is also written in words and shown with an icon.

### Create a budget

Choose **Create budget** and set:

- **Applies to**: **Everything** (an overall budget for all your expenses) or **One category** (expense categories only).
- **Category**: for a category budget.
- **Currency**: a budget counts spending in one currency.
- **Limit**: the amount you plan to spend in the period.
- **Repeats**: **Monthly** (the default), **Weekly** (weeks start on Monday) or **Yearly**. Periods follow the calendar and repeat automatically.
- **Warn me at (percent)**: you see a warning once spending reaches this share of the limit. The default is 80 and the slider accepts 1 to 99. A preview shows what that means for your limit.

You can have one overall budget per period and currency, and one budget per category and period. Otherwise you see "You already have a budget for this category and period" (or the equivalent for an overall budget).

### Read your budgets

- Use the period arrows (**Previous period**, **Next period**) to look at other weeks, months or years, and **Show budgets** to filter by **All**, **Monthly**, **Weekly** or **Yearly**.
- A budget is **on track** below the warning threshold, in **warning** at or above it, and **exceeded** when spending reaches the limit. Past the limit the meter shows the overspend with a hatched continuation rather than relying on colour.
- Only expenses count. Transfers and income do not.

Use **Actions** on a budget to **Edit** or **Delete** it. Deleting asks for confirmation.

## 10. Recurring transactions

A recurring transaction adds an income or expense for you on a schedule, such as rent or a salary. Open **Recurring** to see them with their next date and status (**Active**, **Paused** or **Ended**). The **Show** filter lets you view **All**, **Active**, **Paused** or **Ended**.

### Create one

Choose **Create recurring** and set:

- **Name** and **Type** (Expense or Income).
- **Amount**, **Wallet** and **Category** (the category must match the type). The currency is the wallet currency.
- **Note (optional)**.
- **Repeats every**: a number and a unit (day, week, month or year), for example every 2 weeks.
- **Starts**, and **Ends**: **Never** or **On date** with an **End date**.

A **Next dates** preview lists the upcoming dates as you type. When a monthly schedule falls on a day that some months do not have (for example the 31st), the preview marks that date "Moved to the last day of the month".

### What happens next

- Midas adds each due transaction automatically. If you were away, missed occurrences are added up to today ("catch-up"). A generated transaction is marked **Recurring** in your list.
- **Pause** stops it without losing the schedule and **Resume** continues from the next date, without back-filling the paused period.
- **Run history** (in the **Actions** menu) shows every run as **Added**, **Skipped** or **Failed**.
- A recurring transaction that fails repeatedly is paused automatically (after 5 failures in a row). A "Needs attention" panel at the top of the page lists it with the reason (for example "The wallet was archived.", "The category was retired." or "The last attempt failed.") and a **Resume** button.
- Archiving the wallet pauses its recurring transactions. To resume one, unarchive the wallet first (Midas shows "Unarchive <wallet name> first" with a shortcut, **Open wallets**). If its category was retired, choose a new category by editing it.
- Deleting a recurring transaction keeps the transactions it already added.

## 11. Dashboard

The **Dashboard** is your home page. At the top, a range selector picks the period: **This month** (default), **Last month**, **Last 30 days**, **Last 90 days**, **This year** or a **Custom range**. If you use more than one currency, a **Currency** choice switches the figures, because Midas never adds different currencies together.

It shows:

- **Total balance**: across your active wallets, as of today.
- **Income**, **Expenses** and **Net** for the chosen range. Transfers are not counted as income or expense.
- **Needs attention**: budgets that are exceeded or close to their limit, with a **View budgets** link.
- Charts of **Income and expenses** over time and **Where it went** (spending by category), each with a table alternative.
- **Wallets** with their balances, **Budgets** (with **Manage**), **Recent activity** (with **All activity**) and **Coming up**, the recurring transactions due in the next 14 days.

If you have no wallets, the dashboard invites you to **Create a wallet** first.

## 12. Reports

Open **Reports** for a closer look at a period.

- Choose a **Range** (**This month**, **Last month**, **Last 30 days**, **Last 90 days**, **This year**, **Custom range** with **From** and **To**, or step with **Previous month** and **Next month**) and a **Currency**.
- The summary gives income, expenses and net for the range.
- The trend chart compares income and expenses over time. **Group by** **Auto**, **Day**, **Week** or **Month**; a range with too many periods shows "That is too many periods to chart", so choose a coarser grouping. Switch between **Chart** and **Table** to read the same data either way. With the keyboard, use the arrow keys, Home and End to move between points and Esc to leave the chart.
- **Where it went** breaks spending (**Expenses**) or income (**Income**) down by category, as a chart or a table.
- **Export transactions for this range** downloads a CSV of the transactions in the range (see [section 8](#8-searching-filtering-and-exporting)).

Reports cover ranges of up to about five years (1,830 days).

## 13. Administration

Administrators see an **Administration** group in the navigation. Other people do not see it, and its addresses show the normal "page not found". Nobody becomes an administrator by registering; the operator of the service sets up the first administrator (see the [deployment guide](./operations/deployment.md)).

Administrators can manage accounts and the shared setup, but they can **not** see the financial data of anyone: no wallets, transactions, budgets or balances. The audit log records what administrators do.

### Overview

**Administration** shows platform totals: **Total accounts**, **Administrators**, **Suspended**, **New in last 30 days**, **Active in last 30 days**, **Wallets**, **Transactions**, **Added in last 30 days** and **Active recurring items**.

### Users

**Users** lists accounts with their role, status and join date. Use **Search name or email** and the **Role**, **Status** and **Sort** filters, and the pagination controls (**Rows per page**). Open a user to see **Joined**, **Last sign-in** and **Active sessions**, and to:

- **Suspend account** (with an optional **Reason**): the person is signed out on every device now and cannot sign in until reactivated.
- **Reactivate account**: they can sign in again straight away.
- **Make administrator** or **Remove administrator access**.

You cannot change your own role or status, and there must always be at least one active administrator.

### Default categories

**Default categories** manages the categories every user sees: **Create default category**, **Edit**, **Retire** (existing transactions, budgets and recurring items keep it) and **Restore**. Turn on **Show retired** to see retired ones. Names must be unique among active defaults.

### Audit log

**Audit log** lists sign-in events and administrator actions, newest first, with times in UTC. Filter by **Action**, **Target type**, **Actor email** and a date range (**From** and **To**, in UTC days). Expand an entry to see its request, target and other details. It never contains passwords or amounts.

## 14. Privacy and security

- Your data is yours: other people, including administrators, cannot see your wallets or transactions.
- Passwords are stored only as strong one-way hashes.
- Sign-in is protected by limits on repeated attempts, and sessions can be ended: signing out, changing or resetting your password, or an administrator suspending the account ends them.
- Money is stored in exact whole units (for example cents), so balances never drift through rounding.

## 15. Troubleshooting

| Problem | What to do |
| --- | --- |
| "Email or password is incorrect." | Check both. Use **Forgot password?** if needed. |
| "This account is suspended" | Contact the administrator of your Midas service. |
| "Too many attempts" | Wait for the time shown, then try again. |
| The reset link does not work | It expires after 30 minutes and works once. Request a new one. |
| A wallet or category will not delete | It is in use. Archive the wallet, or reassign the category when asked. |
| A transfer asks for **They receive** | The two wallets use different currencies. Enter the amount that arrives. |
| An amount filter is unavailable | Select wallets that share one currency first. |
| A page says something could not be loaded | Check your connection and try again. |

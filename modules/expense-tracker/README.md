# Expense Tracker

Track personal and group expenses, scan receipts with Gemini Vision, split bills across members, and generate monthly reports with charts.

## What it does

- **Personal expenses** — log, edit, categorize, free-text search, and report on your own spending
- **Income tracking** — mark a personal entry as income (its own category set); reports show income, spending, and net (income − spend), all filterable by flow (expense / income / all)
- **Multi-currency** — enter an expense in any supported currency; it's converted to your base currency (Frankfurter daily FX, frozen at write) so all totals/reports aggregate in one currency. Switch base currency anytime and existing rows are re-converted.
- **Accounts / wallets** — track cash/bank/card/wallet balances; assign a personal expense or income to an account, transfer money between accounts, and see net worth. Balances = opening + income − expense ± transfers (in your base currency).
- **Group expenses** — shared pots with member management, smart splitting (equal / by shares / custom), running balances, and one-click settlement
- **Receipt scanning** — upload a receipt image, Gemini Vision extracts vendor, date, line items, total, and category into a structured JSON expense ready to confirm and save
- **Reports** — monthly totals by category, trend lines, and per-group balance views with PDF export

## Endpoints

Grouped by concern:

### Expenses
- `POST /api/projects/expense-tracker/expenses` — create (personal or group)
- `GET /api/projects/expense-tracker/expenses` — list with filters (type, group, category, date range, free-text `q`, `direction`=expense/income/all)
- `PATCH /api/projects/expense-tracker/expenses/:id` — update
- `DELETE /api/projects/expense-tracker/expenses/:id` — delete
- `GET /api/projects/expense-tracker/expenses/export` — download the filtered rows as CSV (same filters as list; 5000-row cap)

### Groups
- `POST /api/projects/expense-tracker/groups` — create (members added by registered email)
- `GET /api/projects/expense-tracker/groups` — list groups the user belongs to
- `GET|PATCH|DELETE /api/projects/expense-tracker/groups/:id`
- `POST|DELETE /api/projects/expense-tracker/groups/:id/members`
- `GET /api/projects/expense-tracker/groups/:id/balances` — per-member balances + settlement suggestions
- `POST /api/projects/expense-tracker/groups/:id/settle` — record a settlement
- `GET /api/projects/expense-tracker/groups/:id/history` — settlement history

### Receipt scan
- `POST /api/projects/expense-tracker/scan` — image → Gemini Vision → structured receipt JSON (not saved until user confirms)

### Reports
- `GET /api/projects/expense-tracker/reports` — aggregations by category, month, and group

### Preferences
- `GET /api/projects/expense-tracker/prefs` — read per-user prefs (`baseCurrency`, `locale`, `weekStart`); returns defaults if none saved
- `PATCH /api/projects/expense-tracker/prefs` — update one or more prefs (upsert); changing `baseCurrency` re-converts existing rows

### Accounts & transfers
- `GET /api/projects/expense-tracker/accounts` — list accounts with computed balances (`?archived=true` to include archived)
- `POST /api/projects/expense-tracker/accounts` — create an account (cash/bank/card/wallet + opening balance)
- `PATCH|DELETE /api/projects/expense-tracker/accounts/:id` — update / delete (delete unlinks its transactions)
- `GET|POST /api/projects/expense-tracker/transfers` — list / create a transfer between two accounts

## Architecture

```
                      Auth (JWT) ─── required on every route
                           │
Image upload ──► POST /scan
                    │
                    ▼
          Gemini 2.5 Flash (vision, structured output)
                    │
                    ▼
          { vendor, date, items[], total, category }
                    │
                    ▼ (user confirms)
          POST /expenses ──► MongoDB (Expense collection)

Group split ──► calculateSplits()  ──► splitAmong[] stored on Expense
Settlements ──► calculateBalances() + calculateSettlements()
                └── derived on demand; no periodic job
```

Balance math is pure (see [balance.ts](balance.ts)) — given a list of expenses and members, it produces per-member balances and a minimal set of settlement transfers. Runs on every balances request; no cached state to go stale.

## Prompt strategy

The only LLM-driven step is receipt OCR. See [prompts.ts](prompts.ts):

- Extracts vendor, date (forced to `YYYY-MM-DD`), line items (name/quantity/price), total, and category.
- Category is constrained to a fixed enum (`Food & Groceries`, `Transport`, `Utilities`, …) so downstream reports don't fragment on synonyms.
- Total is taken from the receipt's printed total, not the sum of items — receipts frequently disagree with themselves due to tax/tip rounding.
- Structured output via Gemini `responseSchema` means every response is a parseable JSON blob or an error — no regex scraping of free text.

## Data model

Stored in MongoDB (see [models.ts](models.ts)):

- **Group** — `{ name, description, createdBy, members: [{ userId, name, email, isActive }] }`
- **Expense** — `{ type, direction:"expense"|"income", currency, amountBase, accountId?, groupId?, paidBy, amount, description, category, date, splitAmong[], items[], ... }`
- **UserPrefs** — `{ userId (unique), baseCurrency, locale, weekStart }` — per-user settings; `baseCurrency` drives all conversion/display
- **Account** — `{ userId, name, kind:"cash"|"bank"|"card"|"wallet", currency, openingBalance, archived }` — balance computed on read
- **Transfer** — `{ userId, fromAccountId, toAccountId, amount, date, note }` — moves money between accounts; never spending/income

All group operations verify the requesting user is a member before returning or mutating data.

## Known limitations

- Group members must already have a registered account (lookup by email). Inviting via email isn't implemented.
- Receipt scan accuracy drops on crumpled/blurry images and handwritten totals. Always shown to the user for confirmation before saving.
- Multi-currency is per **personal** expense; group expenses settle in a single (entry) currency — cross-currency group splitting isn't implemented yet. FX rates are daily (Frankfurter) and `amountBase` is frozen at write; changing your base currency re-converts existing rows.
- Settlement suggestions minimize transaction count but don't currently record partial payments against a specific expense — they're recorded as standalone settlement events.
- Auth required — this is the only portfolio project that gates the whole feature behind login.

## Files

- [service.ts](service.ts) — all CRUD + aggregation logic (groups, expenses, scan, reports, balances, settlements)
- [balance.ts](balance.ts) — pure split/balance/settlement math
- [rates.ts](rates.ts) — Frankfurter FX fetch + cache + `convert()`
- [currencies.ts](currencies.ts) — client-safe currency codes, symbols, `formatMoney()`
- [models.ts](models.ts) — Mongoose schemas
- [prompts.ts](prompts.ts) — receipt OCR prompt
- [schemas.ts](schemas.ts) — Zod validation for every input + Gemini `responseSchema`
- [../../app/api/projects/expense-tracker](../../app/api/projects/expense-tracker) — route handlers (auth-gated)
- [../../app/projects/expense-tracker](../../app/projects/expense-tracker) — UI (dashboard, groups, add modal, reports with Recharts)

## Local run

Uses the top-level Next.js app. See the [root README](../../README.md) for setup. Requires `GEMINI_API_KEY` and `MONGODB_URI` in the environment, plus a working auth configuration (JWT secret).

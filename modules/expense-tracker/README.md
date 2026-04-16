# Expense Tracker

Track personal and group expenses, scan receipts with Gemini Vision, split bills across members, and generate monthly reports with charts.

## What it does

- **Personal expenses** — log, edit, categorize, and report on your own spending
- **Group expenses** — shared pots with member management, smart splitting (equal / by shares / custom), running balances, and one-click settlement
- **Receipt scanning** — upload a receipt image, Gemini Vision extracts vendor, date, line items, total, and category into a structured JSON expense ready to confirm and save
- **Reports** — monthly totals by category, trend lines, and per-group balance views with PDF export

## Endpoints

Grouped by concern:

### Expenses
- `POST /api/projects/expense-tracker/expenses` — create (personal or group)
- `GET /api/projects/expense-tracker/expenses` — list with filters (type, group, category, date range)
- `PATCH /api/projects/expense-tracker/expenses/:id` — update
- `DELETE /api/projects/expense-tracker/expenses/:id` — delete

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
- **Expense** — `{ type, groupId?, paidBy, amount, description, category, date, splitAmong[], items[], ... }`

All group operations verify the requesting user is a member before returning or mutating data.

## Known limitations

- Group members must already have a registered account (lookup by email). Inviting via email isn't implemented.
- Receipt scan accuracy drops on crumpled/blurry images and handwritten totals. Always shown to the user for confirmation before saving.
- No currency conversion — amounts are stored as a single number with no currency field; assumes one currency per user.
- Settlement suggestions minimize transaction count but don't currently record partial payments against a specific expense — they're recorded as standalone settlement events.
- Auth required — this is the only portfolio project that gates the whole feature behind login.

## Files

- [service.ts](service.ts) — all CRUD + aggregation logic (groups, expenses, scan, reports, balances, settlements)
- [balance.ts](balance.ts) — pure split/balance/settlement math
- [models.ts](models.ts) — Mongoose schemas
- [prompts.ts](prompts.ts) — receipt OCR prompt
- [schemas.ts](schemas.ts) — Zod validation for every input + Gemini `responseSchema`
- [../../app/api/projects/expense-tracker](../../app/api/projects/expense-tracker) — route handlers (auth-gated)
- [../../app/projects/expense-tracker](../../app/projects/expense-tracker) — UI (dashboard, groups, add modal, reports with Recharts)

## Local run

Uses the top-level Next.js app. See the [root README](../../README.md) for setup. Requires `GEMINI_API_KEY` and `MONGODB_URI` in the environment, plus a working auth configuration (JWT secret).

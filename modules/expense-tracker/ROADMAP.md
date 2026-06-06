# Expense Tracker — Architecture & Roadmap (living doc)

> **Purpose.** Single source of truth for the expense-tracker evolution: the phased plan,
> design decisions, schema migrations, and a running changelog. Update this file in the
> **same PR/commit** as the code it describes. If the code and this doc disagree, the doc is a bug.
>
> **How to use this file**
> - Pick the next unchecked item in the lowest-numbered unfinished phase.
> - Before coding, skim **§2 Conventions** and the **Decision Log** so you don't re-litigate settled choices.
> - When you ship something, tick its checkbox, add a dated line to **§7 Changelog**, and record any
>   non-obvious choice in **§6 Decision Log**.
> - Status legend: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked (see note).

---

## 1. Current state (baseline — what exists today)

Web (`app/projects/expense-tracker/`) + mobile (`mobile/app/`) on a shared service layer
(`modules/expense-tracker/`), MongoDB via Mongoose, JWT auth, Gemini Vision for receipt OCR.

**Shipped features**
- Personal + group expenses (CRUD), category tagging, date.
- Group member management (by registered email), equal/share/custom splits, running balances,
  minimal-transaction settlement (`balance.ts`), settlement history.
- Receipt scanning → Gemini structured output → prefilled expense.
- Reports: by category / month / day-of-week / group; hero stats; Recharts (web); PDF export.
- Pagination, category + date + type + settled filters.

**Core models today** (`models.ts`)
- `Group { name, description, createdBy, members[{userId,name,email,isActive}] }`
- `Expense { type:"personal"|"group", groupId?, createdBy, paidBy{id,name}, amount, description,
  category, date, splitAmong[], splits[], items[], receiptUrl, rawExtraction, settledAt, settlementId }`

**Known gaps the roadmap closes** (from README "Known limitations" + product review)
- Expense-only (no income / net worth / savings rate).
- Single implied currency (`amount` is a bare number).
- No "source of money" (cash/bank/card accounts).
- No budgets, no recurring/subscriptions, no free-text search.
- No AI beyond receipt OCR.

---

## 2. Conventions (read before adding code)

- **Service-first.** All business logic lives in `modules/expense-tracker/*.ts`. API routes
  (`app/api/projects/expense-tracker/**`) only: auth → validate (Zod) → call service → `handleRouteError`.
- **Validation.** Every input gets a Zod schema in `schemas.ts`. Reuse `CATEGORIES`, `isoDate` helpers.
- **Pure math stays pure.** Balance/budget/forecast math goes in dedicated pure modules
  (like `balance.ts`) — no DB calls, fully unit-testable.
- **Mongoose model pattern.** `(mongoose.models.X as Model<XDoc>) || mongoose.model(...)` to survive HMR.
- **Money is integer-safe at the edges.** Store amounts as `Number` (existing), but all rounding/splits
  go through the existing distribute-remainder logic — never `toFixed` in two places.
- **Web + mobile parity.** Each user-facing feature ships a web tab/modal **and** a mobile screen.
  Shared types live in `schemas.ts`; mobile re-declares only what it can't import.
- **Auth on every route.** `requireAuth`; group routes verify membership before read/mutate.
- **Migrations are additive + lazy.** New fields are optional with defaults; backfill via a script in
  `scripts/` and/or read-time defaulting. Never a destructive in-place rewrite without a backup step.

---

## 3. Phased roadmap

Dependency order matters: **money primitives** (Phase 1) unlock everything else; **planning/automation**
(Phase 2) depend on them; **AI** (Phase 3) reads all of the above; **engagement** (Phase 4) is polish.

### Phase 0 — Quick wins (no schema migration, ship first)
- [x] **Free-text search** — `q` param on `expenseFilterSchema` + `reportFilterSchema`; case-insensitive
      **regex** (not a `$text` index) over `description`/`items.name`/`category` so partial words match;
      debounced search box wired into web Dashboard + mobile Expenses, summary total stays consistent.
- [x] **CSV export** — exports the **filtered expense rows** (not just summary): shared `buildExpenseQuery`
      drives both list & export; `exportExpensesCsv` (pure `expensesToCsv`, formula-injection-safe, 5000-row cap);
      `GET /expenses/export` streams `text/csv` w/ BOM. Web = blob download; mobile = `expo-file-system` write +
      `expo-sharing` (added `expo-file-system` native dep → **needs a production rebuild**).
- [x] **Settings scaffold** — `UserPrefs` model (`userId` unique, `baseCurrency`/`locale`/`weekStart`),
      `getPrefs`/`updatePrefs` service, `GET|PATCH /api/projects/expense-tracker/prefs`. `baseCurrency`
      defaults to `INR` for continuity; Phase 1B swaps the implicit default for explicit onboarding (D-3).
      *No UI yet — container only, as planned.*

### Phase 1 — Money primitives (foundational; do before 2–4)
> **Scope (D-6): personal-only for v1.** Income, currency, accounts apply to personal transactions; group
> flows keep their existing split/settle model untouched.

**1A. Income tracking** — ✅ shipped 2026-06-05
- [x] Added `direction: "expense" | "income"` to `Expense` (default `"expense"`, indexed). Pre-1A rows lack
      the field and are treated as expense at read time + via query `$or` — **no migration run** (D-2 kept the
      collection name). Income is personal-only (D-6); `INCOME_CATEGORIES` is a separate set so spending
      breakdowns don't fragment.
- [x] `getSummary` excludes income from spending totals/breakdowns and returns `incomeAmount`, `incomeCount`,
      `netAmount` (income − spend). List + CSV export gained a `direction` filter (expense/income/all);
      CSV has a `Direction` column.
- [x] UI: income/expense toggle on web `AddExpenseModal` + mobile `add-expense` (income hides group/split/scan,
      switches to income categories). Dashboard + mobile Expenses got a **Flow** filter, an adaptive headline,
      a **Net flow** card, and emerald income-row styling.
- [x] Verified: 31/31 smoke checks (direction filters, summary math 1850 spend / 50000 income / 48150 net,
      income-category + personal-only validation, CSV direction column). Web + mobile typecheck clean.

**1B. Multi-currency** — ✅ shipped 2026-06-06
- [x] Added `currency` + `amountBase` to `Expense` (amountBase frozen at write). `rates.ts` wraps Frankfurter
      (keyless daily ECB rates) with a 12h in-process cache; `currencies.ts` holds the client-safe code/symbol
      list. Same-currency entries skip the FX call entirely.
- [x] `getSummary` aggregates spending/income/net/breakdowns on `amountBase` (pre-1B rows fall back to
      `amount`); group split shares are scaled by the base/entry ratio. Changing base currency re-converts
      every owned row server-side (`recomputeAmountBase`) so history isn't shown with a mismatched symbol.
- [x] UI: currency picker on web `AddExpenseModal` + mobile `add-expense`; **Base** currency switcher on web
      Dashboard + mobile Expenses; rows show the original `currency` amount when it differs from base; web
      Dashboard + Reports formatted via `formatMoney(base)`. CSV gained `Currency` + `Amount (base)` columns.
- [x] Verified: 38/38 smoke checks incl. live USD→INR conversion, base==amount short-circuit, unsupported
      currency → 400, summary on base amounts. Web + mobile typecheck clean.
- [ ] **Deferred (1B.2):** group expenses still settle in a single (entry) currency — cross-currency group
      splitting + group default currency, and PDF/mobile-dashboard symbol theming, are a follow-up.

**1C. Accounts / Wallets** — ✅ shipped 2026-06-06
- [x] `Account` model `{ userId, name, kind, currency, openingBalance, archived }` + `Transfer` model (own
      collection, never in expense/income reports). Optional `accountId` on personal expenses (D-6).
- [x] Balances computed in **base currency**: `openingBalance + Σincome − Σexpense + transfers-in − transfers-out`
      (via `amountBase`, aggregation). Deleting an account unlinks its txns (keeps them) + removes its transfers.
- [x] **Transfers** between accounts (separate model; affects balances, not spending). Same-account rejected.
- [x] API: `GET|POST /accounts`, `PATCH|DELETE /accounts/:id`, `GET|POST /transfers`. Account-selector on add
      forms (web + mobile, personal only). New **Accounts** tab (web) + tab (mobile): net worth, balances,
      add account, transfer.
- [x] Verified: 55/55 smoke checks (opening balance, expense −, income +, transfer both sides, same-account
      400, delete-unlinks). Web + mobile typecheck clean.
- [ ] **Deferred (1C.2):** per-account foreign currency (accounts assume base currency); reconcile view; edit/archive UI.

### Phase 2 — Planning & automation (depends on Phase 1)
> **Scope (D-6): personal-only for v1** — budgets & recurring rules are per-user, not per-group.

**2A. Budgets**
- [ ] New `Budget` model `{ userId, scope:"overall"|"category", category?, period:"monthly", amount,
      currency, rollover?:boolean, startDate }`.
- [ ] Pure `budget.ts`: given budgets + transactions in a period → spent / remaining / % / projected.
- [ ] Alerts at 80% / 100% / over (surface in UI now; push notifications in Phase 4).
- [ ] UI: **Budgets tab** (web) + screen (mobile): progress bars, per-category, month switcher.

**2B. Recurring expenses & subscriptions**
- [ ] New `RecurringRule` model `{ userId, template:{amount,currency,category,description,accountId,direction},
      cadence:"weekly"|"monthly"|"yearly"|cron, nextRunAt, lastRunAt, autoPost:boolean, endDate? }`.
- [ ] Materialization: **pure `generateDue(rules, now)` generator** in the service layer, invoked by a
      **daily Vercel Cron route** (D-4); same fn reusable lazy-on-open as a fallback. Generated txns link
      back via `recurringId`; guard with `nextRunAt`/`lastRunAt` for idempotency. Default `autoPost:false`.
- [ ] UI: **Recurring tab** — upcoming bills calendar, "confirm/post" for non-auto rules, pause/skip.

### Phase 3 — Intelligence (AI differentiators; reuses existing Gemini wiring)
> **v1 order (D-5):** ship NL entry + forecast first; Spending Coach chat is deferred to a later iteration.
- [ ] **NL expense entry** *(v1)* — "paid 450 for lunch with Rahul, split equally" → structured txn via Gemini
      structured output (mirror the receipt-scan pattern in `prompts.ts`/`schemas.ts`).
- [ ] **Month-end forecast** *(v1)* — pure projection from month-to-date run rate + recurring rules + budgets.
- [ ] **Spending Coach chat** *(deferred)* — Q&A grounded in the user's aggregated transactions (server builds a
      compact summary context; never dump raw rows to the model). New `/coach` route.
- [ ] **Subscription detective** — detect recurring merchant/amount patterns in history; flag price hikes,
      duplicates, unused (no recent linked txn).
- [ ] **Anomaly alerts** — per-merchant/category z-score; flag outliers ("4× your usual here").

### Phase 4 — Engagement & advanced
- [ ] **Savings Goals** `{ name, target, deadline, linkedAccountId? }` with progress + "what-if" trim plan.
- [ ] **Shareable bill-split** — link/QR so non-registered members can view & settle (closes README gap #1).
- [ ] **Receipt → warranty/return tracker** — reuse stored `items[]`/`receiptUrl`; surface return-window countdowns.
- [ ] **Push notifications** — budget breaches, bills due, anomalies (Expo push on mobile).
- [ ] **Recharts on mobile** — charts currently web-only; bring reports to parity.

---

## 4. Target data model (end-state sketch)

> Additive to today's schema. `?` = optional/defaulted for backward compatibility.

```
UserPrefs   { userId, baseCurrency (required), locale, weekStart, ... }   # Phase 0/1  (D-3: no default)
Account     { userId, name, kind, currency, openingBalance, archived }    # Phase 1C
Expense  →  Transaction (same collection)                                 # Phase 1A
  { ...existing,
    direction?: "expense"|"income",        # 1A  (default "expense")
    currency?: string, amountBase?: number, # 1B
    accountId?: ObjectId,                    # 1C
    recurringId?: ObjectId,                  # 2B
    transferId?: ObjectId }                  # 1C transfers
Budget        { userId, scope, category?, period, amount, currency, rollover?, startDate }  # 2A
RecurringRule { userId, template, cadence, nextRunAt, lastRunAt, autoPost, recurringId }    # 2B
Goal          { userId, name, target, deadline?, linkedAccountId? }                          # 4
```

**Indexing notes:** text index on `description`+`items.name` (Phase 0); `{userId, accountId}` and
`{userId, direction, date}` for account/net aggregations; `{userId, nextRunAt}` on RecurringRule.

---

## 5. Per-feature delivery checklist (apply to every roadmap item)

A feature is **done** only when all of these are true:
- [ ] Mongoose model/field added (additive, defaulted) + index if queried.
- [ ] Zod schema in `schemas.ts`.
- [ ] Service function(s) in `modules/expense-tracker/` (pure math split out where applicable).
- [ ] API route(s) under `app/api/projects/expense-tracker/**`, auth-gated, `handleRouteError`.
- [ ] Web UI (tab/modal/section).
- [ ] Mobile UI (screen).
- [ ] Backfill/migration script in `scripts/` if existing data needs it.
- [ ] README "What it does" / "Endpoints" / "Data model" updated.
- [ ] Changelog line added in §7 + Decision Log entry if a non-obvious choice was made.

---

## 6. Decision Log (memory — append-only; don't rewrite history)

| ID | Date | Decision | Rationale | Status |
|----|------|----------|-----------|--------|
| D-1 | 2026-06-05 | Build features in dependency order: money primitives → planning → AI → engagement. | Budgets/recurring/AI all read currency, accounts, and income; building them first avoids rework. | Active |
| D-2 | 2026-06-05 | Keep the `Expense` **collection** name; add `direction` instead of a new `Income` collection. | Avoids a data migration + duplicate query paths; "Transaction" is a UI/doc rename only. | Realized (1A) |
| D-3 | 2026-06-05 | FX rates: **Frankfurter** (keyless, daily ECB rates) as provider; **multi-region day one** — `UserPrefs.baseCurrency` is required (no INR default), convert between any pair. Cache rates once daily; store `amount`+`currency`+`amountBase`. | Free + no API key to leak; multi-region keeps the app usable for any audience; storing all three keeps history auditable when rates move. | Active |
| D-4 | 2026-06-05 | Recurring generation: **Vercel Cron (daily)** via a thin route that calls a **pure `now`-parameterized generator** in the service layer. | Cron is free on Vercel Hobby (100 jobs, once/day, ±59min) — adequate for bills. Pure generator stays unit-testable and lets lazy-on-open reuse the same logic as a fallback. | Active |
| D-5 | 2026-06-05 | **AI v1 = NL entry + month-end forecast first; Spending Coach chat deferred** to a later iteration. | Cheaper + lower-risk: NL entry mirrors the existing receipt-scan structured-output pattern, forecast is pure math. Chat needs careful context-building & cost control — ship the wins first. | Active |
| D-6 | 2026-06-05 | **Budgets, accounts/wallets, and income are personal-only for v1** (not applied to groups). | Keeps Phase 1–2 scope tight; group flows already have their own split/settle model. Group budgets/accounts can be a later phase if demanded. | Active |

> All Phase-1 / Phase-2 / AI-scope decisions resolved. **Cron caveat:** Hobby cron is once-daily, ±59min —
> fine for batch bill posting, not time-critical work. Default new RecurringRules to `autoPost:false` until trusted.

---

## 7. Changelog (append newest at top)

- 2026-06-06 — **Phase 1C (accounts/wallets) shipped.** `Account` + `Transfer` models, `accountId` on personal
  expenses, base-currency balances (opening + income − expense ± transfers), account CRUD + transfers API,
  Accounts tab/screen + account selector on both platforms. 55/55 smoke. Deferred: per-account foreign
  currency, reconcile view (1C.2). **Phase 1 (money primitives) complete.**

- 2026-06-06 — **Settings & account panel.** Added a Settings tab (web) / screen (mobile): base-currency
  switcher (moved out of the Dashboard filter bar) + week-start; **delete account** (web gap filled, moved off
  the mobile dashboard); mobile **Profile** (name edit, change password, profile-photo upload/remove) mirroring
  the web `/profile`; mobile "Open web app" link. New `scripts/smoke-account.ts` (profile/password/delete) —
  10/10; feature smoke still 46/46. Both platforms typecheck clean. Note: `GET/PATCH /api/profile` return
  `{ user }` (not `{ profile }`); changing display name does not rewrite denormalized `paidBy.name`/group members.

- 2026-06-06 — **Phase 1B (multi-currency) shipped.** `currency` + `amountBase` on expenses; `rates.ts`
  (Frankfurter, cached) + `currencies.ts`; reports aggregate on base; base-currency switcher with
  server-side recompute; currency picker + original-currency rows on web & mobile; CSV currency columns.
  38/38 smoke (live FX). Deferred: cross-currency group splitting, PDF/mobile-dashboard symbol theming (1B.2).

- 2026-06-05 — **Phase 1A (income tracking) COMPLETE.** `direction` field (lazy-defaulted, no migration),
  income/net in summary, direction filter on list + CSV export, income/expense toggle + Net cards on web &
  mobile. 31/31 smoke checks; both platforms typecheck clean. D-2 realized (kept `Expense` collection).

- 2026-06-05 — **Phase 0 COMPLETE:** CSV export added (filtered rows, `/expenses/export`, web blob download +
  mobile share via new `expo-file-system` dep). Search + `UserPrefs` scaffold shipped earlier same day. Web &
  mobile typecheck clean. ⚠️ `expo-file-system` is a native module — next mobile production build must rebuild.
- 2026-06-05 — **Phase 0 (partial) shipped:** free-text search (regex `q` on list + summary, web + mobile,
  debounced) and the `UserPrefs` settings scaffold (model + `getPrefs`/`updatePrefs` + `/prefs` GET/PATCH).
  Both web & mobile typecheck clean. Remaining Phase-0 item: CSV export. No data migration required.
- 2026-06-05 — Resolved D-5 (AI v1 = NL entry + forecast, chat deferred) and D-6 (Phase 1–2 personal-only). All open questions closed.
- 2026-06-05 — Resolved D-3 (Frankfurter, multi-region) and D-4 (Vercel Cron, daily) → both Active. Phase 1 unblocked.
- 2026-06-05 — Created this roadmap/architecture doc. Baseline captured; phases 0–4 defined. No code changes yet.

---

## 8. Open questions for the owner

> **All resolved as of 2026-06-05** — see Decision Log D-3…D-6. New questions get appended here as phases progress.

1. ~~Base currency / audience~~ — **Resolved (D-3):** multi-region day one, `UserPrefs.baseCurrency` required.
2. ~~AI scope for v1~~ — **Resolved (D-5):** NL entry + forecast first; chat deferred.
3. ~~Recurring infra~~ — **Resolved (D-4):** Vercel Cron (daily) calling a pure generator.
4. ~~Group vs personal scope~~ — **Resolved (D-6):** personal-only for v1.

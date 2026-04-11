# AI Playground

A unified web platform to showcase multiple Generative AI projects in one place. Built to demonstrate practical GenAI engineering skills for job applications, and designed to grow — new AI projects can be added as standalone modules without touching existing code.

---

## 1. Vision & Goals

**Problem:** Scattered AI demo repos don't tell a coherent story to recruiters. A single deployed platform with multiple working AI features is far more impressive than five half-finished GitHub repos.

**Goal:** Build one extensible hub that:
- Hosts multiple AI-powered tools under one roof
- Runs entirely on free-tier APIs and hosting
- Can be extended with new projects as new skills are learned
- Demonstrates production-quality engineering (evals, caching, rate limits, observability)

**Target audience:** Hiring managers and recruiters evaluating GenAI/full-stack candidates.

---

## 2. Tech Stack (all free tier)

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 14 (App Router) + Tailwind + shadcn/ui | Single project hosts both UI and API routes |
| Backend | Next.js Route Handlers (`app/api/*`) | No separate Express service — one repo, one deploy |
| Database | MongoDB Atlas (free 512 MB) | Flexible schema for varied projects |
| Vector DB | Chroma (self-host) or Qdrant Cloud free tier | For future RAG projects |
| LLM | Google Gemini 2.0 Flash | Generous free tier, multimodal |
| Fast LLM | Groq (Llama / Mixtral) | Speed demos, fallback |
| Embeddings | Gemini `text-embedding-004` | Free, same ecosystem |
| File storage | Cloudinary free / Supabase Storage | Receipt images, resumes |
| Auth | JWT + bcrypt (or NextAuth) | Simple, self-contained |
| Hosting | Vercel free | Handles frontend + serverless API routes together |

---

## 3. Architecture

```
┌──────────────────────────────────────────────────┐
│  Next.js 14 App (single project, deployed on     │
│  Vercel — UI + API in one repo)                  │
│                                                  │
│  app/                                            │
│   ├─ page.tsx                   (project gallery)│
│   ├─ projects/[slug]/page.tsx   (per-project UI) │
│   └─ api/projects/[slug]/...    (route handlers) │
│                                                  │
│  modules/<name>/  ← pure business logic per proj │
│  lib/             ← db, llm, auth, rateLimit     │
└──────────────┬───────────────────────────────────┘
               │
     ┌─────────┴──────────┐
     ▼                    ▼
 MongoDB Atlas       Chroma / Qdrant
 (users, history)    (embeddings for RAG — later)
```

**Key principle:** each AI project is an isolated **module** under `modules/<name>/`. Route handlers in `app/api/projects/<name>/` are thin — they just call into the module. Adding a new project = new module folder + new route folder + new page. Zero changes to existing code.

### Why single Next.js project (no separate Express)
- One repo, one deploy, one `package.json`
- Shared TypeScript types between UI and API — no duplication
- Simpler local dev (`npm run dev` runs everything)
- No CORS, no separate hosting, no service-to-service plumbing

### Serverless limits to plan around (Vercel Hobby)
- **10s execution timeout** per request — fine for single Gemini calls; long RAG indexing jobs would need a background worker
- **4.5 MB request body** — cap receipt image uploads accordingly
- **No long-lived processes** — SQL Generator sandbox spins up an in-memory SQLite per request (stateless, still fast)

If a future project genuinely needs a persistent worker, the `modules/` folder is pure logic so it can be lifted into a small standalone service later without rewrites.

---

## 4. Repository Structure

Single Next.js project — UI and API live together.

```
ai-playground/
├── app/
│   ├── page.tsx                              # Landing + project gallery
│   ├── layout.tsx
│   ├── projects/
│   │   ├── resume-matcher/page.tsx
│   │   ├── sql-generator/page.tsx
│   │   └── receipt-tracker/page.tsx
│   └── api/
│       └── projects/
│           ├── resume-matcher/
│           │   ├── analyze/route.ts
│           │   └── upload/route.ts
│           ├── sql-generator/
│           │   ├── generate/route.ts
│           │   ├── execute/route.ts
│           │   └── sample-schemas/route.ts
│           └── receipt-tracker/
│               ├── upload/route.ts
│               ├── expenses/route.ts
│               └── summary/route.ts
│
├── modules/                                  # ← business logic, one folder per project
│   ├── resume-matcher/
│   │   ├── service.ts
│   │   ├── prompts.ts
│   │   └── schemas.ts
│   ├── sql-generator/
│   │   ├── service.ts
│   │   ├── prompts.ts
│   │   ├── sandbox.ts                        # in-memory SQLite per request
│   │   └── validator.ts                      # SELECT-only guard
│   └── receipt-tracker/
│       ├── service.ts
│       ├── prompts.ts
│       └── schemas.ts
│
├── lib/                                      # shared infra
│   ├── db.ts                                 # cached Mongoose connection
│   ├── llm.ts                                # unified Gemini / Groq wrapper
│   ├── embed.ts
│   ├── storage.ts                            # Cloudinary / Supabase
│   ├── auth.ts                               # JWT helpers
│   ├── rateLimit.ts
│   └── api-client.ts                         # typed fetch wrapper for client components
│
├── models/                                   # Mongoose schemas
│   ├── User.ts
│   ├── Usage.ts
│   ├── ResumeAnalysis.ts
│   ├── SqlQuery.ts
│   └── Expense.ts
│
├── components/
│   ├── ui/                                   # shadcn
│   ├── shared/                               # ChatBox, FileDrop, Loader, ResultCard
│   └── projects/                             # per-project widgets
│
├── types/                                    # shared TS types (UI ↔ API)
├── tailwind.config.ts
├── next.config.mjs
├── package.json
└── README.md
```

**Module pattern:** a route handler at `app/api/projects/<name>/<action>/route.ts` is a thin adapter — it parses the request, applies auth + rate limit middleware, calls into `modules/<name>/service.ts`, and returns the result. All AI logic lives in the module so it stays testable and portable.

---

## 5. Shared Foundation (Phase 0 — build first)

**API / server-side foundation** (all inside the Next.js project)
1. `lib/db.ts` — cached Mongoose connection (serverless-safe pattern: reuse connection across warm invocations)
2. `lib/llm.ts` — unified wrapper with `complete()`, `chat()`, `vision()`, `embed()`. Any module can switch between Gemini and Groq without code changes.
3. `lib/rateLimit.ts` — per-IP limiter (Upstash Redis free tier or in-memory for dev) to protect free-tier API quotas
4. `lib/auth.ts` — JWT helpers (optional login so users can save history)
5. `models/Usage.ts` — log every AI call (tokens, latency) for observability
6. Shared error handling wrapper for route handlers (consistent JSON errors)

**Client / UI foundation**
1. Landing page (`app/page.tsx`) with project card grid (title, description, tags, "Try it")
2. Reusable components: `<ChatBox>`, `<FileUpload>`, `<ResultCard>`, `<LoadingSpinner>`, `<CopyButton>`
3. Typed `lib/api-client.ts` fetch wrapper (shared types from `types/`)
4. Dark / light theme toggle (shadcn built-in)
5. Global layout with nav + footer

**Phase 0 deliverable:** deployed Next.js project on Vercel with landing page showing "Coming Soon" project cards and a working `GET /api/health` route proving the API layer is wired to MongoDB.

---

## 6. Initial Project Modules

### Project 1 — Resume ↔ JD Matcher
**Input:** Resume (PDF or text) + Job Description (text)
**Output:** Match score (0–100), matched skills, gaps, 3 tailored bullet rewrites

**Endpoints**
- `POST /api/projects/resume-matcher/analyze` — `{ resumeText, jdText }` → result
- `POST /api/projects/resume-matcher/upload` — PDF → extracted text (via `pdf-parse`)

**Flow**
1. Parse PDF → text
2. Single Gemini call with structured JSON output (`responseSchema`)
3. Return scored analysis
4. Persist to MongoDB if user is logged in

**UI:** two-panel layout (resume left, JD right), result card with score gauge, skill chips (green = match, red = gap), copyable rewritten bullets.

**Eval:** manual — 5 curated resume/JD pairs.

---

### Project 2 — Natural Language → SQL Generator
**Input:** Schema (DDL) + natural-language question
**Output:** SQL query + explanation + optional safe execution on sample data

**Endpoints**
- `POST /api/projects/sql-generator/generate` — `{ schema, question, dialect }` → `{ sql, explanation }`
- `POST /api/projects/sql-generator/execute` — runs against a **sandboxed in-memory SQLite** (never the user's real DB)
- `GET /api/projects/sql-generator/sample-schemas` — preset schemas (ecommerce, HR, blog)

**Flow**
1. Prompt template: system prompt + schema + few-shot examples + user question
2. Gemini structured output → `{ sql, explanation, warnings }`
3. Validate SQL is SELECT-only (regex + `sqlparser`)
4. Execute on in-memory SQLite seeded with fake data

**UI:** schema selector, question input with example chips, Monaco editor (read-only) for generated SQL, results table, explanation accordion.

**Security rule:** ONLY `SELECT` allowed. Reject `DROP`, `DELETE`, `UPDATE`, `INSERT`. Hard constraint at both prompt and validation layers.

---

### Project 3 — Receipt Expense Tracker (Multimodal)
**Input:** Receipt image(s)
**Output:** Extracted vendor, date, line items, total, category — stored in DB

**Endpoints**
- `POST /api/projects/receipt-tracker/upload` — image → Gemini Vision → structured JSON → saved
- `GET /api/projects/receipt-tracker/expenses` — list with filters
- `GET /api/projects/receipt-tracker/summary` — totals by category / month
- `DELETE /api/projects/receipt-tracker/:id`

**Flow**
1. Image upload → Cloudinary (or base64 direct to Gemini)
2. Gemini 2.0 Flash vision call with structured output schema
3. Auto-categorize (food / transport / shopping / etc.)
4. Store in `Expense` collection
5. MongoDB aggregation pipeline for summary

**UI:** drag-drop upload, processing state with preview, filterable expense table, Recharts dashboard (pie by category, bar by month).

**Eval:** test on 10 real receipts, measure extraction accuracy.

---

## 7. Data Models (MongoDB)

```ts
User           { _id, email, passwordHash, createdAt }
Usage          { _id, userId, projectSlug, tokensUsed, latencyMs, createdAt }
ResumeAnalysis { _id, userId, resumeText, jdText, result, createdAt }
SqlQuery       { _id, userId, schema, question, sql, createdAt }
Expense        { _id, userId, vendor, date, items[], total, category, imageUrl, rawExtraction, createdAt }
```

---

## 8. Build Phases & Timeline

| Phase | Scope | Estimate |
|---|---|---|
| **0** | Foundation: Next.js project, MongoDB, LLM wrapper, landing page, Vercel deploy | 2–3 days |
| **1** | Project 1 — Resume Matcher end-to-end | 3–4 days |
| **2** | Project 2 — SQL Generator with sandbox execution | 4–5 days |
| **3** | Project 3 — Receipt Tracker with vision + dashboard | 4–5 days |
| **4** | Polish: auth, history, README per project, demo video, eval docs | 2–3 days |

**Total: ~3 weeks part-time.**

---

## 9. Free-Tier Guardrails

- **Rate limit:** 10 req/hr anonymous, 50 req/hr logged-in (per IP + per user)
- **Response cache:** hash inputs → cache outputs in MongoDB for 24 h (saves quota on repeated demos)
- **Input size caps:** resume ≤ 5 pages, image ≤ 5 MB, SQL schema ≤ 10 KB
- **Token budget:** set `maxOutputTokens` conservatively per module
- **Key separation:** distinct API keys for dev and prod so demos don't burn dev quota

---

## 10. Portfolio Polish (per project)

Each module's README should include:
- Problem statement + demo GIF
- Architecture diagram
- Prompt engineering notes (what was tried, what worked, what failed)
- Eval results table
- Known limitations
- Local run instructions

Plus one 3-minute Loom walkthrough of the whole platform on the root README. Recruiters watch these.

---

## 11. Extension Roadmap

Drop-in slots for future modules (each is a new `backend/src/modules/<name>/` + `frontend/app/projects/<name>/` — no edits to existing code):

- YouTube Video Q&A (RAG over transcripts)
- PDF Chat (RAG + vector DB)
- GitHub Repo Explainer (code understanding with tree-sitter chunking)
- Code Review Bot (GitHub App + function calling)
- Web Scraping Agent (NL → structured JSON via Gemini tool use + Playwright)
- Meeting Notes → Action Items (push to Notion / Trello)
- Voice Assistant (Whisper + Gemini + TTS)
- LLM Evaluation Framework (LLM-as-judge harness across modules)

---

## 12. Success Criteria

- [ ] Platform deployed and publicly reachable on Vercel + Render
- [ ] All three initial projects functional end-to-end
- [ ] Per-project eval numbers documented in READMEs
- [ ] Rate limiting and response caching verified under load
- [ ] 3-minute demo video recorded and linked from root README
- [ ] Adding a 4th project requires zero edits to the first three

---

*Last updated: 2026-04-11*

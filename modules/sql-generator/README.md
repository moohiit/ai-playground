# Natural Language → SQL Generator

Translate a plain-English question against a database schema into a valid SQLite `SELECT` query, with a short explanation and optional safe execution on seeded sample data.

## What it does

**Input:** Database schema (DDL text) + natural-language question

**Output:** `{ sql, explanation, warnings }`. The generated SQL can then be executed against an **in-memory SQLite sandbox** seeded with sample rows — never against the user's real database.

## Endpoints

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/projects/sql-generator/sample-schemas` | — | Preset schemas (ecommerce, HR, blog, etc.) |
| POST | `/api/projects/sql-generator/generate` | `{ schema, question }` | `{ sql, explanation, warnings }` |
| POST | `/api/projects/sql-generator/execute` | `{ ddl, seed, query }` | Sandbox query result |

## Architecture

```
Schema DDL + NL question ─────► POST /generate
                                       │
                                       ▼
                       Gemini 2.5 Flash (structured output)
                                       │
                                       ▼
                     SELECT-only validator (regex + AST-ish checks)
                                       │
                                       ▼
                       { sql, explanation, warnings }

User clicks "Run" ──► POST /execute
                             │
                             ▼
                 DDL safety check + SELECT-only check
                             │
                             ▼
              in-memory better-sqlite3 DB (created fresh per request)
                             │
                             ▼
                     { columns, rows, rowCount }
```

Sandbox is **ephemeral** — a fresh in-memory SQLite is created per request from the supplied DDL + seed rows, the query runs, results return, then the DB is discarded. Stateless, no filesystem, no cross-user bleed.

## Safety model

This is the security-sensitive project in the portfolio. Two layers of defense:

1. **Prompt-level:** System prompt explicitly forbids `INSERT`, `UPDATE`, `DELETE`, `DROP`, `CREATE`, `ALTER`, `TRUNCATE`, `ATTACH`, `PRAGMA`.
2. **Code-level:** [validator.ts](validator.ts) rejects any generated SQL that isn't a single `SELECT` — even if the model disobeys the prompt. Applied on both the `/generate` response and every `/execute` request. DDL is separately validated to block data-modifying statements in the seed payload.

If the validator rejects a generated query, the result still returns with a warning rather than silently failing.

## Prompt strategy

- System prompt pins the dialect to SQLite and forbids DDL/DML keywords.
- Temperature 0.1 — SQL should be deterministic for a given schema+question.
- Encourages explicit `JOIN ... ON` syntax and `LIMIT` when the question implies "top N".
- If the question can't be answered with the given schema, the model returns a best-effort query plus a warning.

See [prompts.ts](prompts.ts) for the full system prompt.

## Known limitations

- SQLite dialect only. Postgres/MySQL/BigQuery-specific syntax (window functions in some shapes, `RETURNING`, etc.) may be generated if the schema hints that way, but execution targets SQLite.
- No query cost analysis — a valid but pathological `JOIN` could be slow on a real DB. (Sandbox rows are tiny, so it's cheap to test.)
- No support for stored procedures, triggers, or views that require persistence — everything runs in-memory per request.
- Schema size capped at 10 KB, seed at 50 KB, query at 5 KB (see [schemas.ts](schemas.ts)).
- Rate-limited to 10 requests/hour per client.

## Files

- [service.ts](service.ts) — `generateSql()`, `executeSql()`
- [validator.ts](validator.ts) — SELECT-only + DDL safety guards
- [sandbox.ts](sandbox.ts) — `runSandboxQuery()` (better-sqlite3, in-memory)
- [sampleSchemas.ts](sampleSchemas.ts) — preset schemas for the UI
- [prompts.ts](prompts.ts) — system prompt + prompt builder
- [schemas.ts](schemas.ts) — Zod input/output schemas + Gemini `responseSchema`
- [../../app/api/projects/sql-generator](../../app/api/projects/sql-generator) — route handlers
- [../../app/projects/sql-generator](../../app/projects/sql-generator) — UI (Monaco editor for generated SQL, results table, explanation)

## Local run

Uses the top-level Next.js app. See the [root README](../../README.md) for setup. Requires `GEMINI_API_KEY` in the environment. `better-sqlite3` is the only native dependency — `npm install` handles it on most platforms.

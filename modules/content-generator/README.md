# AI Content Generator

Turn a short brief into a polished long-form blog post — streamed live — plus SEO metadata and ready-to-post social variants, all in one flow.

## What it does

**Input:** a brief — topic, optional audience, tone (professional / casual / witty / academic / storytelling), length (short / medium / long), optional keywords, optional notes.

**Output:** three stages, each usable on its own:
1. **Outline** — title, one-sentence hook, and 3–6 concrete H2 sections with summaries. Editable inline before drafting.
2. **Article** — full GitHub-flavored Markdown, streamed token-by-token into a live preview. Cancelable mid-stream.
3. **Derivatives** — SEO meta title + description + slug + tags, a Twitter thread (3–6 tweets with per-tweet character counts), and a LinkedIn post.

## Endpoints

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/projects/content-generator/outline` | `BriefInput` | `{ outline: Outline }` |
| POST | `/api/projects/content-generator/draft` | `BriefInput & { outline }` | **Streaming** `text/plain` — Markdown token deltas |
| POST | `/api/projects/content-generator/derivatives` | `{ article }` | `{ derivatives: Derivatives }` |

Types in [schemas.ts](schemas.ts).

## Architecture

```
Brief ──► POST /outline
           │
           ▼
   Gemini (JSON structured output, temp 0.6)
           │
           ▼
   Outline (editable in the UI)
           │
           ▼
Brief + edited outline ──► POST /draft
                                 │
                                 ▼
                    Gemini streamGenerateContent (SSE)
                                 │
                                 ▼
                    ReadableStream of Markdown deltas
                                 │
                                 ▼
              Client renders via react-markdown + remark-gfm
                                 │
                                 ▼
                 (auto-fires) POST /derivatives
                                 │
                                 ▼
           Gemini (JSON structured output, temp 0.5)
                                 │
                                 ▼
                 { metaTitle, metaDescription, slug,
                   tags, twitterThread[], linkedinPost }
```

Three distinct LLM calls, each tuned differently: low-temperature structured JSON for the outline and derivatives, streaming prose for the article itself.

## Prompt strategy

Three system prompts in [prompts.ts](prompts.ts), each scoped tightly:

- **Outline** — JSON only, 3-6 sections, concrete H2 headings (no "Introduction"), weaves keywords naturally without stuffing. Tone and audience inform the title and hook.
- **Draft** — Markdown only, starts with a single H1, follows the outline's section order exactly (user-edited outline is the source of truth). Hard rules: no invented stats/quotes, target word count ±20%, no preamble or sign-off.
- **Derivatives** — SEO constraints enforced in the prompt (meta title 50-60 chars, description 140-160, slug kebab-case 3-6 words, each tweet ≤270 chars, LinkedIn post 120-220 words ending in a question).

Why three calls and not one giant call:
- Editable outline means the user can redirect the draft before it's expensive.
- Streaming only matters for long prose — structured JSON can't be streamed reliably mid-generation.
- Different temperatures per stage (0.6 / 0.7 / 0.5) fit each task: exploratory for the outline, looser for prose, tight for SEO constraints.

## UX notes worth calling out

- **Streaming preview** — the first real streaming UX in the playground. Uses Gemini's `streamGenerateContent?alt=sse` endpoint piped through a server `ReadableStream` to the browser, decoded token-by-token.
- **Cancel mid-stream** — `AbortController` on the client aborts the fetch; the server's reader loop exits cleanly and the usage log records the partial call.
- **Derivatives are automatic** — when the draft stream closes, the client fires `/derivatives` without user action. Tabs unlock as data arrives.
- **Copy everywhere** — one-click copy on the article, each SEO field, each tweet, the full thread, and the LinkedIn post. Download .md uses the SEO slug when available, falls back to the H1.
- **Over-length guardrails in the UI** — tweet character counts turn amber past 270 and red past 280 so the user can quickly spot tweets that need trimming.

## Known limitations

- No image generation (header images) — Gemini image generation isn't wired in.
- No fact-checking or source citations — the system prompt forbids inventing statistics, but the model can still produce plausible-sounding but unverifiable claims. Always human-review before publishing.
- No persistence — nothing is saved server-side beyond the usage counter. Use the Copy/Download buttons to keep anything you like.
- Vercel Hobby tier caps the draft route at 60s. Very long articles with large token budgets can still hit this on slow runs.
- Rate-limited to 10 requests/hour per client per action (outline, draft, derivatives are separate buckets — see each route's `rateLimit` call).

## Files

- [service.ts](service.ts) — `generateOutline()`, `streamDraft()` (AsyncGenerator<string>), `generateDerivatives()`
- [prompts.ts](prompts.ts) — three system prompts + prompt builders
- [schemas.ts](schemas.ts) — Zod schemas + Gemini `responseSchema` for outline and derivatives
- [../../lib/llm.ts](../../lib/llm.ts) — shared `streamText()` helper (Gemini SSE)
- [../../app/api/projects/content-generator](../../app/api/projects/content-generator) — route handlers
- [../../app/projects/content-generator](../../app/projects/content-generator) — UI (brief form, editable outline, streaming preview, tabbed output)
- [../../components/shared/MarkdownPreview.tsx](../../components/shared/MarkdownPreview.tsx) — reusable `prose`-styled renderer
- [../../components/shared/CopyButton.tsx](../../components/shared/CopyButton.tsx) — reusable copy-to-clipboard button

## Local run

Uses the top-level Next.js app. See the [root README](../../README.md) for setup. Requires `GEMINI_API_KEY` in the environment. No DB required for the feature itself (only for the usage log, which fails quietly if Mongo is unavailable).

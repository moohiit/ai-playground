# Resume ↔ JD Matcher

Score how well a candidate's resume fits a job description and return actionable feedback — matched skills, gaps, and three tailored bullet rewrites — in a single structured LLM call.

## What it does

**Input:** Resume (PDF upload or pasted text) + Job Description (text)

**Output:**
- Overall match score (0–100)
- One-paragraph summary of fit
- Matched vs. missing skills
- Top strengths and gaps
- Up to 3 existing resume bullets rewritten to better emphasize JD keywords — with reasoning per rewrite

## Endpoints

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/projects/resume-matcher/upload` | `multipart/form-data` (field `file`: PDF) | `{ text }` — extracted plain text |
| POST | `/api/projects/resume-matcher/analyze` | `{ resumeText, jdText }` | `{ result: AnalysisResult }` |

`AnalysisResult` shape lives in [schemas.ts](schemas.ts).

## Architecture

```
PDF upload ──► unpdf text extraction ──► client
                                          │
Resume text + JD text ─────────────────►  POST /analyze
                                          │
                                          ▼
                              Gemini 2.5 Flash (structured output)
                                          │
                                          ▼
                              Zod-validated AnalysisResult
```

Single LLM call. No RAG, no chaining — structured output with `responseSchema` does all the work.

## Prompt strategy

- System prompt enforces evidence-based scoring bands (85-100 strong, 65-84 solid, 40-64 partial, 0-39 poor) so scores stay calibrated across runs.
- Explicit anti-hallucination rule: "Do NOT invent skills or experience that aren't in the resume."
- Tailored bullets must be rewrites of **existing** bullets, never fabricated — enforced both in the system prompt and by keeping the `original` field alongside `rewritten`.
- Low temperature (0.2) to reduce variance across identical inputs.

See [prompts.ts](prompts.ts) for the full text.

## Known limitations

- PDF extraction is plain-text only — tables, columns, and images in the resume are flattened and may produce messy input.
- No fine-grained weighting: a missing required skill counts the same as a missing nice-to-have.
- No persistence — analyses are not saved; rerunning the same pair costs another API call.
- Resume capped at 20k chars, JD at 10k chars (see [schemas.ts](schemas.ts)).
- Rate-limited to 10 requests/hour per client (see the analyze route).

## Files

- [service.ts](service.ts) — `analyzeResume()`, `extractPdfText()`
- [prompts.ts](prompts.ts) — system prompt + prompt builder
- [schemas.ts](schemas.ts) — Zod input/output schemas + Gemini `responseSchema`
- [../../app/api/projects/resume-matcher](../../app/api/projects/resume-matcher) — route handlers
- [../../app/projects/resume-matcher](../../app/projects/resume-matcher) — UI

## Local run

Uses the top-level Next.js app. See the [root README](../../README.md) for setup. Requires `GEMINI_API_KEY` in the environment.

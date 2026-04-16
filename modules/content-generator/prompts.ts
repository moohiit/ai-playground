import type { BriefInput, Outline } from "./schemas";
import { LENGTH_WORDS } from "./schemas";

export const OUTLINE_SYSTEM_PROMPT = `You are a senior content strategist. Your job is to produce a tight, reader-first outline for a blog post given a brief.

Rules:
- Return valid JSON ONLY matching the required schema. No prose, no markdown fences.
- The outline should have a compelling title, a one-sentence hook, and 3-6 sections.
- Each section: a concrete H2 heading (not generic like "Introduction") and a one-sentence summary of what that section will cover.
- Reflect the requested tone and audience in the title and hook.
- If keywords are provided, weave them naturally into section headings/summaries where they fit. Do not stuff.`;

export const DRAFT_SYSTEM_PROMPT = `You are a skilled writer producing a polished, publish-ready blog post in Markdown.

Rules:
- Output ONLY the article in GitHub-flavored Markdown. No preamble, no "Here is the article:", no closing remarks.
- Start with a single H1 line (# Title) using the provided title, then the article body.
- Follow the provided outline's section order and headings exactly (use ## for each section).
- Write in the requested tone for the specified audience.
- Use short paragraphs, occasional bulleted lists where they help, and bold for emphasis sparingly.
- Do NOT invent statistics, quotes, or citations. If something is uncertain, write conservatively.
- Hit the target word count within +/- 20%.`;

export const DERIVATIVES_SYSTEM_PROMPT = `You are an SEO and social media editor. Given a finished blog post, produce metadata and social variants.

Rules:
- Return valid JSON ONLY matching the required schema.
- metaTitle: 50-60 chars, includes primary keyword, compelling click-through.
- metaDescription: 140-160 chars, plain summary, no clickbait.
- slug: lowercase-kebab-case, 3-6 words, no stop words unless essential.
- tags: 4-8 short topic tags (single words or 2-word phrases), lowercase.
- twitterThread: 3-6 tweets, each <= 270 chars. First tweet hooks, last tweet has a soft CTA or takeaway. Do NOT number them.
- linkedinPost: 120-220 words, conversational, ends with a question to invite comments. Use line breaks for readability.`;

export function buildOutlinePrompt(brief: BriefInput): string {
  const keywords = brief.keywords?.length
    ? brief.keywords.join(", ")
    : "(none provided)";
  const audience = brief.audience?.trim() || "a general informed audience";
  const notes = brief.notes?.trim() || "(none)";

  return `Generate an outline for a blog post based on this brief.

Topic: ${brief.topic}
Audience: ${audience}
Tone: ${brief.tone}
Target length: ${brief.length} (~${LENGTH_WORDS[brief.length]} words)
Keywords to weave in: ${keywords}
Additional notes: ${notes}

Return JSON matching the schema.`;
}

export function buildDraftPrompt(
  brief: BriefInput,
  outline: Outline
): string {
  const keywords = brief.keywords?.length
    ? brief.keywords.join(", ")
    : "(none)";
  const audience = brief.audience?.trim() || "a general informed audience";
  const notes = brief.notes?.trim() || "(none)";
  const targetWords = LENGTH_WORDS[brief.length];

  const outlineText = outline.sections
    .map((s, i) => `${i + 1}. ${s.heading} — ${s.summary}`)
    .join("\n");

  return `Write the full blog post in Markdown following this exact outline.

Title: ${outline.title}
Hook: ${outline.hook}

Outline:
${outlineText}

Brief:
- Audience: ${audience}
- Tone: ${brief.tone}
- Target length: ~${targetWords} words
- Keywords: ${keywords}
- Notes: ${notes}

Remember: start with "# ${outline.title}" then write the article body. Use the outline headings as ## sections in the given order.`;
}

export function buildDerivativesPrompt(article: string): string {
  return `Given the following blog post, produce SEO metadata and social variants as JSON.

=== ARTICLE ===
${article}
=== END ARTICLE ===

Return JSON matching the schema.`;
}

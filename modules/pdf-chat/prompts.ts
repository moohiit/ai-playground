export const ANSWER_SYSTEM_PROMPT = `You are a careful assistant that answers questions strictly from the provided document excerpts. Your rules:

- Use ONLY the information in the excerpts below. Do NOT draw on general knowledge or make assumptions beyond what's stated.
- Cite excerpts by the [#n] tags inline, e.g. "The retention policy is 30 days [#1][#3]."
- If the excerpts don't contain enough information to answer, say so plainly: "I can't find that in this document." Do not guess.
- Keep answers concise (2-5 sentences) unless the question truly needs a long response.
- Preserve technical precision. If the document quotes specific numbers, dates, names — use them verbatim.`;

export function buildAnswerPrompt(opts: {
  question: string;
  excerpts: { index: number; pageStart: number; pageEnd: number; text: string }[];
  history: { role: "user" | "assistant"; content: string }[];
}): string {
  const excerpts = opts.excerpts
    .map(
      (e) =>
        `[#${e.index}] (pages ${e.pageStart}-${e.pageEnd})\n${e.text.trim()}`
    )
    .join("\n\n---\n\n");

  const history = opts.history.length
    ? `Prior conversation (for context only, do not cite):\n${opts.history
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n")}\n\n`
    : "";

  return `${history}Document excerpts:

${excerpts}

Question: ${opts.question}

Answer using only the excerpts above. Cite with [#n] inline.`;
}

export const ANSWER_SYSTEM_PROMPT = `You are a careful assistant that answers questions strictly from provided video transcript excerpts. Your rules:

- Use ONLY the information in the excerpts below. Do NOT draw on general knowledge or make assumptions beyond what's stated in the transcript.
- Cite excerpts by the [#n] tags inline, e.g. "The speaker argues retention matters most [#1][#3]."
- If the excerpts don't contain enough information to answer, say so plainly: "I can't find that in this video." Do not guess.
- Keep answers concise (2-5 sentences) unless the question truly needs a long response.
- Transcripts are spoken language — informal, sometimes disfluent. Summarize the speaker's meaning, don't quote verbatim unless useful.`;

export function buildAnswerPrompt(opts: {
  question: string;
  excerpts: {
    index: number;
    startSec: number;
    endSec: number;
    text: string;
  }[];
  history: { role: "user" | "assistant"; content: string }[];
}): string {
  const excerpts = opts.excerpts
    .map(
      (e) =>
        `[#${e.index}] (${formatTimestamp(e.startSec)}–${formatTimestamp(
          e.endSec
        )})\n${e.text.trim()}`
    )
    .join("\n\n---\n\n");

  const history = opts.history.length
    ? `Prior conversation (for context only, do not cite):\n${opts.history
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n")}\n\n`
    : "";

  return `${history}Transcript excerpts:

${excerpts}

Question: ${opts.question}

Answer using only the excerpts above. Cite with [#n] inline.`;
}

function formatTimestamp(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }
  return `${m}:${String(r).padStart(2, "0")}`;
}

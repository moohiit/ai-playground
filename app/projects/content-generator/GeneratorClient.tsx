"use client";

import { useMemo, useState, type FormEvent } from "react";
import { cn } from "@/lib/utils";
import {
  LENGTHS,
  LENGTH_WORDS,
  TONES,
  type BriefInput,
  type Outline,
} from "@/modules/content-generator/schemas";

type Status = "idle" | "outlining" | "outline-ready" | "error";

export function GeneratorClient() {
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState<BriefInput["tone"]>("professional");
  const [length, setLength] = useState<BriefInput["length"]>("medium");
  const [keywordsRaw, setKeywordsRaw] = useState("");
  const [notes, setNotes] = useState("");

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [outline, setOutline] = useState<Outline | null>(null);

  const keywords = useMemo(
    () =>
      keywordsRaw
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean)
        .slice(0, 10),
    [keywordsRaw]
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (topic.trim().length < 5) return;

    setStatus("outlining");
    setError(null);
    setOutline(null);

    try {
      const res = await fetch(
        "/api/projects/content-generator/outline",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic: topic.trim(),
            audience: audience.trim(),
            tone,
            length,
            keywords,
            notes: notes.trim(),
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Outline failed");
      setOutline(data.outline);
      setStatus("outline-ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Outline failed");
      setStatus("error");
    }
  }

  function updateOutlineTitle(title: string) {
    if (!outline) return;
    setOutline({ ...outline, title });
  }

  function updateOutlineHook(hook: string) {
    if (!outline) return;
    setOutline({ ...outline, hook });
  }

  function updateSectionHeading(idx: number, heading: string) {
    if (!outline) return;
    const next = outline.sections.map((s, i) =>
      i === idx ? { ...s, heading } : s
    );
    setOutline({ ...outline, sections: next });
  }

  function updateSectionSummary(idx: number, summary: string) {
    if (!outline) return;
    const next = outline.sections.map((s, i) =>
      i === idx ? { ...s, summary } : s
    );
    setOutline({ ...outline, sections: next });
  }

  function removeSection(idx: number) {
    if (!outline || outline.sections.length <= 2) return;
    setOutline({
      ...outline,
      sections: outline.sections.filter((_, i) => i !== idx),
    });
  }

  function addSection() {
    if (!outline || outline.sections.length >= 10) return;
    setOutline({
      ...outline,
      sections: [
        ...outline.sections,
        { heading: "New section", summary: "Describe what it covers." },
      ],
    });
  }

  const canSubmit = topic.trim().length >= 5 && status !== "outlining";
  const isOutlining = status === "outlining";

  return (
    <div className="flex flex-col gap-10">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-6 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-6 backdrop-blur-sm"
      >
        <div className="flex flex-col gap-2">
          <label className="text-xs uppercase tracking-[0.18em] text-zinc-500">
            Topic
          </label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. How to design a resilient retry strategy for LLM calls"
            className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-brand-500/60 focus:outline-none"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Audience (optional)">
            <input
              type="text"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="senior backend engineers"
              className="w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-brand-500/60 focus:outline-none"
            />
          </Field>

          <Field label="Keywords (comma-separated, optional)">
            <input
              type="text"
              value={keywordsRaw}
              onChange={(e) => setKeywordsRaw(e.target.value)}
              placeholder="retries, exponential backoff, idempotency"
              className="w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-brand-500/60 focus:outline-none"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tone">
            <div className="flex flex-wrap gap-2">
              {TONES.map((t) => (
                <ChipButton
                  key={t}
                  active={tone === t}
                  onClick={() => setTone(t)}
                >
                  {t}
                </ChipButton>
              ))}
            </div>
          </Field>

          <Field label="Length">
            <div className="flex flex-wrap gap-2">
              {LENGTHS.map((l) => (
                <ChipButton
                  key={l}
                  active={length === l}
                  onClick={() => setLength(l)}
                >
                  {l} · ~{LENGTH_WORDS[l]}w
                </ChipButton>
              ))}
            </div>
          </Field>
        </div>

        <Field label="Notes (optional)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Anything the writer should know — angle, references to include, things to avoid."
            className="w-full resize-y rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-brand-500/60 focus:outline-none"
          />
        </Field>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-zinc-500">
            Step 1 of 3 — generate an outline first, then draft the article.
          </p>
          <button
            type="submit"
            disabled={!canSubmit}
            className={cn(
              "inline-flex items-center gap-2 rounded-md bg-gradient-to-r from-brand-600 via-brand-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-brand-500/30 transition",
              !canSubmit && "cursor-not-allowed opacity-50"
            )}
          >
            {isOutlining ? (
              <>
                <Spinner /> Generating…
              </>
            ) : outline ? (
              <>Regenerate outline →</>
            ) : (
              <>Generate outline →</>
            )}
          </button>
        </div>
      </form>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {outline && (
        <OutlineEditor
          outline={outline}
          onTitle={updateOutlineTitle}
          onHook={updateOutlineHook}
          onHeading={updateSectionHeading}
          onSummary={updateSectionSummary}
          onRemove={removeSection}
          onAdd={addSection}
        />
      )}

      {!outline && !isOutlining && !error && (
        <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/40 p-10 text-center text-sm text-zinc-500">
          Outline will appear here. Step 3 adds the full article draft.
        </div>
      )}
    </div>
  );
}

function OutlineEditor({
  outline,
  onTitle,
  onHook,
  onHeading,
  onSummary,
  onRemove,
  onAdd,
}: {
  outline: Outline;
  onTitle: (v: string) => void;
  onHook: (v: string) => void;
  onHeading: (idx: number, v: string) => void;
  onSummary: (idx: number, v: string) => void;
  onRemove: (idx: number) => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-6 backdrop-blur-sm animate-fade-up">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-[0.18em] text-brand-500/90">
          Outline · editable
        </div>
        <span className="text-[11px] text-zinc-500">
          {outline.sections.length} section
          {outline.sections.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-[11px] uppercase tracking-wider text-zinc-500">
          Title
        </label>
        <input
          value={outline.title}
          onChange={(e) => onTitle(e.target.value)}
          className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-base font-semibold text-zinc-100 focus:border-brand-500/60 focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-[11px] uppercase tracking-wider text-zinc-500">
          Hook
        </label>
        <textarea
          value={outline.hook}
          onChange={(e) => onHook(e.target.value)}
          rows={2}
          className="resize-y rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-200 focus:border-brand-500/60 focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-3">
        {outline.sections.map((section, idx) => (
          <div
            key={idx}
            className="flex flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-500/15 text-xs font-semibold text-brand-400">
                {idx + 1}
              </span>
              <input
                value={section.heading}
                onChange={(e) => onHeading(idx, e.target.value)}
                className="flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-medium text-zinc-100 hover:border-zinc-800 focus:border-brand-500/60 focus:bg-zinc-950/60 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => onRemove(idx)}
                disabled={outline.sections.length <= 2}
                className="text-xs text-zinc-500 transition hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="Remove section"
              >
                Remove
              </button>
            </div>
            <textarea
              value={section.summary}
              onChange={(e) => onSummary(idx, e.target.value)}
              rows={2}
              className="resize-y rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-400 focus:border-brand-500/60 focus:outline-none"
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onAdd}
          disabled={outline.sections.length >= 10}
          className="text-xs text-brand-400 transition hover:text-brand-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          + Add section
        </button>
        <span className="text-[11px] text-zinc-500">
          Step 3 will draft the article from this outline.
        </span>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </label>
      {children}
    </div>
  );
}

function ChipButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs capitalize transition",
        active
          ? "border-brand-500/60 bg-brand-500/15 text-brand-400"
          : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
      )}
    >
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <span
      className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/60 border-t-transparent"
      aria-hidden
    />
  );
}

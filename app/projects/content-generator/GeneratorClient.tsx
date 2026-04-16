"use client";

import { useState, type FormEvent } from "react";
import { cn } from "@/lib/utils";
import {
  LENGTHS,
  LENGTH_WORDS,
  TONES,
  type BriefInput,
} from "@/modules/content-generator/schemas";

export function GeneratorClient() {
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState<BriefInput["tone"]>("professional");
  const [length, setLength] = useState<BriefInput["length"]>("medium");
  const [keywordsRaw, setKeywordsRaw] = useState("");
  const [notes, setNotes] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // Wired up in Step 2.
  }

  const canSubmit = topic.trim().length >= 5;

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
            Generate outline
            <span>→</span>
          </button>
        </div>
      </form>

      <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/40 p-10 text-center text-sm text-zinc-500">
        Outline and article will appear here once wired up.
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

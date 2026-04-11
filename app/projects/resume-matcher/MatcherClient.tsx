"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { cn } from "@/lib/utils";
import type { AnalysisResult } from "@/modules/resume-matcher/schemas";

type Status = "idle" | "uploading" | "analyzing" | "done" | "error";

export function MatcherClient() {
  const [resumeText, setResumeText] = useState("");
  const [jdText, setJdText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus("uploading");
    setError(null);
    setFileName(file.name);

    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/projects/resume-matcher/upload", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setResumeText(data.text);
      setStatus("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setStatus("error");
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!resumeText.trim() || !jdText.trim()) return;

    setStatus("analyzing");
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/projects/resume-matcher/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText, jdText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");
      setResult(data.result);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
      setStatus("error");
    }
  }

  const isBusy = status === "uploading" || status === "analyzing";

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel
            title="Resume"
            hint={fileName ? `Loaded: ${fileName}` : "Upload a PDF or paste text"}
            right={
              <label className="cursor-pointer text-xs text-brand-500 hover:underline">
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={isBusy}
                />
                Upload PDF
              </label>
            }
          >
            <textarea
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              placeholder="Paste your resume here, or upload a PDF..."
              rows={14}
              disabled={isBusy}
              className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-sm leading-relaxed text-zinc-200 placeholder:text-zinc-600 focus:border-brand-500 focus:outline-none"
            />
          </Panel>

          <Panel title="Job Description" hint="Paste the JD">
            <textarea
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              placeholder="Paste the job description here..."
              rows={14}
              disabled={isBusy}
              className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-sm leading-relaxed text-zinc-200 placeholder:text-zinc-600 focus:border-brand-500 focus:outline-none"
            />
          </Panel>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={isBusy || !resumeText.trim() || !jdText.trim()}
            className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === "analyzing" ? "Analyzing..." : "Analyze match"}
          </button>
          {status === "uploading" && (
            <span className="text-xs text-zinc-500">Parsing PDF...</span>
          )}
          {error && <span className="text-xs text-red-400">{error}</span>}
        </div>
      </form>

      {result && <ResultCard result={result} />}
    </div>
  );
}

function Panel({
  title,
  hint,
  right,
  children,
}: {
  title: string;
  hint?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>
          {hint && <p className="text-xs text-zinc-500">{hint}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function ResultCard({ result }: { result: AnalysisResult }) {
  return (
    <div className="flex flex-col gap-6 rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
      <div className="flex flex-col gap-3 border-b border-zinc-800 pb-5 sm:flex-row sm:items-center sm:gap-6">
        <ScoreGauge score={result.score} />
        <p className="text-sm leading-relaxed text-zinc-300">
          {result.summary}
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <ChipList
          title="Matched skills"
          items={result.matchedSkills}
          tone="success"
        />
        <ChipList
          title="Missing skills"
          items={result.missingSkills}
          tone="danger"
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <BulletList title="Strengths" items={result.strengths} />
        <BulletList title="Gaps to address" items={result.gaps} />
      </div>

      <div>
        <h4 className="mb-3 text-sm font-semibold text-zinc-200">
          Tailored bullet rewrites
        </h4>
        <div className="flex flex-col gap-3">
          {result.tailoredBullets.map((b, i) => (
            <BulletRewrite key={i} {...b} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ScoreGauge({ score }: { score: number }) {
  const tone =
    score >= 85
      ? "text-emerald-400"
      : score >= 65
      ? "text-brand-500"
      : score >= 40
      ? "text-amber-400"
      : "text-red-400";
  return (
    <div className="flex shrink-0 items-baseline gap-1">
      <span className={cn("text-5xl font-bold tabular-nums", tone)}>
        {Math.round(score)}
      </span>
      <span className="text-sm text-zinc-500">/ 100</span>
    </div>
  );
}

function ChipList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "success" | "danger";
}) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {title}
      </h4>
      {items.length === 0 ? (
        <p className="text-xs text-zinc-600">None</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <span
              key={item}
              className={cn(
                "rounded-md px-2 py-0.5 text-xs",
                tone === "success"
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "bg-red-500/10 text-red-400"
              )}
            >
              {item}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function BulletList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {title}
      </h4>
      <ul className="flex flex-col gap-1.5 text-sm text-zinc-300">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-zinc-600">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BulletRewrite({
  original,
  rewritten,
  reasoning,
}: {
  original: string;
  rewritten: string;
  reasoning: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(rewritten);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="mb-2 text-xs text-zinc-500 line-through">{original}</div>
      <div className="mb-2 flex items-start justify-between gap-3">
        <p className="text-sm text-zinc-100">{rewritten}</p>
        <button
          onClick={handleCopy}
          className="shrink-0 rounded-md border border-zinc-800 px-2 py-1 text-[11px] text-zinc-400 hover:border-brand-500 hover:text-brand-500"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="text-[11px] italic text-zinc-600">Why: {reasoning}</p>
    </div>
  );
}

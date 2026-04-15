"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
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
    <div className="flex flex-col gap-10">
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel
            title="Resume"
            hint={fileName ? `Loaded: ${fileName}` : "Upload a PDF or paste text"}
            accent="from-brand-500/30 to-transparent"
            right={
              <label
                className={cn(
                  "group inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-brand-500/30 bg-brand-500/10 px-2.5 py-1 text-xs font-medium text-brand-500 transition hover:bg-brand-500/20",
                  isBusy && "pointer-events-none opacity-50"
                )}
              >
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={isBusy}
                />
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
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
              className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-950/70 p-3 text-sm leading-relaxed text-zinc-200 placeholder:text-zinc-600 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
            <CharCount value={resumeText} />
          </Panel>

          <Panel
            title="Job Description"
            hint="Paste the JD"
            accent="from-fuchsia-500/30 to-transparent"
          >
            <textarea
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              placeholder="Paste the job description here..."
              rows={14}
              disabled={isBusy}
              className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-950/70 p-3 text-sm leading-relaxed text-zinc-200 placeholder:text-zinc-600 transition-colors focus:border-fuchsia-500 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/30"
            />
            <CharCount value={jdText} />
          </Panel>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="submit"
            disabled={isBusy || !resumeText.trim() || !jdText.trim()}
            className="group relative inline-flex items-center gap-2 overflow-hidden rounded-lg bg-gradient-to-r from-brand-600 via-brand-500 to-fuchsia-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-500/30 transition-transform hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
          >
            <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            {status === "analyzing" ? (
              <>
                <Spinner />
                Analyzing...
              </>
            ) : (
              <>
                Analyze match
                <span className="transition-transform group-hover:translate-x-1">
                  →
                </span>
              </>
            )}
          </button>
          {status === "uploading" && (
            <span className="inline-flex items-center gap-2 text-xs text-zinc-500">
              <Spinner /> Parsing PDF...
            </span>
          )}
          {error && (
            <span className="rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs text-red-400">
              {error}
            </span>
          )}
        </div>
      </form>

      {result && <ResultCard result={result} />}
    </div>
  );
}

function CharCount({ value }: { value: string }) {
  return (
    <div className="mt-2 flex justify-end text-[10px] uppercase tracking-wider text-zinc-600">
      {value.length.toLocaleString()} chars
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="3"
      />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Panel({
  title,
  hint,
  right,
  accent,
  children,
}: {
  title: string;
  hint?: string;
  right?: React.ReactNode;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-4 backdrop-blur-sm transition-colors hover:border-zinc-700">
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r opacity-80",
          accent ?? "from-brand-500/30 to-transparent"
        )}
      />
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
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
    <div className="animate-fade-up flex flex-col gap-8 rounded-2xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-6 backdrop-blur-sm sm:p-8">
      <div className="flex flex-col gap-5 border-b border-zinc-800/80 pb-6 sm:flex-row sm:items-center sm:gap-8">
        <ScoreGauge score={result.score} />
        <div className="flex-1">
          <div className="mb-2 text-xs uppercase tracking-[0.18em] text-brand-500/90">
            Summary
          </div>
          <p className="text-sm leading-relaxed text-zinc-300 sm:text-base">
            {result.summary}
          </p>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
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

      <div className="grid gap-6 sm:grid-cols-2">
        <BulletList
          title="Strengths"
          items={result.strengths}
          tone="success"
        />
        <BulletList title="Gaps to address" items={result.gaps} tone="danger" />
      </div>

      <div>
        <h4 className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-brand-500/90">
          Tailored bullet rewrites
        </h4>
        <div className="flex flex-col gap-3">
          {result.tailoredBullets.map((b, i) => (
            <BulletRewrite key={i} index={i} {...b} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ScoreGauge({ score }: { score: number }) {
  const target = Math.max(0, Math.min(100, Math.round(score)));
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    const start = performance.now();
    const duration = 900;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayed(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  const tone =
    target >= 85
      ? { text: "text-emerald-400", stroke: "#34d399", glow: "rgba(52,211,153,0.45)" }
      : target >= 65
      ? { text: "text-brand-500", stroke: "#818cf8", glow: "rgba(129,140,248,0.45)" }
      : target >= 40
      ? { text: "text-amber-400", stroke: "#fbbf24", glow: "rgba(251,191,36,0.45)" }
      : { text: "text-red-400", stroke: "#f87171", glow: "rgba(248,113,113,0.45)" };

  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (displayed / 100) * circumference;

  return (
    <div className="relative flex shrink-0 items-center justify-center">
      <svg
        width="140"
        height="140"
        viewBox="0 0 140 140"
        className="-rotate-90"
        style={{ filter: `drop-shadow(0 0 12px ${tone.glow})` }}
      >
        <circle
          cx="70"
          cy="70"
          r={radius}
          stroke="rgb(39 39 42)"
          strokeWidth="10"
          fill="none"
        />
        <circle
          cx="70"
          cy="70"
          r={radius}
          stroke={tone.stroke}
          strokeWidth="10"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.15s linear" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("text-4xl font-bold tabular-nums", tone.text)}>
          {displayed}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">
          / 100
        </span>
      </div>
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
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
        {title}
      </h4>
      {items.length === 0 ? (
        <p className="text-xs text-zinc-600">None</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item, i) => (
            <span
              key={item}
              className={cn(
                "animate-fade-up rounded-md px-2.5 py-1 text-xs font-medium ring-1 transition-transform hover:-translate-y-0.5",
                tone === "success"
                  ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20"
                  : "bg-red-500/10 text-red-400 ring-red-500/20"
              )}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              {item}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function BulletList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "success" | "danger";
}) {
  const bulletColor =
    tone === "success" ? "text-emerald-400" : "text-red-400";
  return (
    <div>
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
        {title}
      </h4>
      <ul className="flex flex-col gap-2 text-sm text-zinc-300">
        {items.map((item, i) => (
          <li
            key={i}
            className="animate-fade-up flex gap-2.5"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <span className={cn("mt-1.5 text-xs", bulletColor)}>●</span>
            <span className="leading-relaxed">{item}</span>
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
  index,
}: {
  original: string;
  rewritten: string;
  reasoning: string;
  index: number;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(rewritten);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div
      className="group animate-fade-up relative overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/60 p-4 transition-colors hover:border-brand-500/40"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-gradient-to-b from-brand-500 via-fuchsia-500 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-wider text-zinc-600">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-semibold text-zinc-400">
          {index + 1}
        </span>
        Before
      </div>
      <div className="mb-3 text-xs text-zinc-500 line-through decoration-zinc-700">
        {original}
      </div>
      <div className="mb-2 text-[10px] uppercase tracking-wider text-brand-500/90">
        After
      </div>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm leading-relaxed text-zinc-100">{rewritten}</p>
        <button
          onClick={handleCopy}
          className={cn(
            "shrink-0 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-all",
            copied
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
              : "border-zinc-800 text-zinc-400 hover:border-brand-500/60 hover:text-brand-500"
          )}
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>
      <p className="mt-3 border-t border-zinc-800/70 pt-2 text-[11px] italic text-zinc-500">
        <span className="text-zinc-400">Why:</span> {reasoning}
      </p>
    </div>
  );
}

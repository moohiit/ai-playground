"use client";

import { useState, type FormEvent } from "react";
import { cn } from "@/lib/utils";
import type { RepoAnalysis } from "@/modules/repo-explainer/schemas";

type Status = "idle" | "analyzing" | "done" | "error";
type Meta = { owner: string; repo: string; fileCount: number; analyzedFiles: string[] };

export function RepoClient() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<RepoAnalysis | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setStatus("analyzing");
    setError(null);
    setAnalysis(null);
    setMeta(null);

    try {
      const res = await fetch("/api/projects/repo-explainer/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");
      setAnalysis(data.analysis);
      setMeta(data.meta);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex gap-3">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/owner/repo"
            required
            disabled={status === "analyzing"}
            className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-brand-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={status === "analyzing" || !url.trim()}
            className="rounded-lg bg-brand-600 px-6 py-3 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === "analyzing" ? "Analyzing..." : "Analyze"}
          </button>
        </div>
        {status === "analyzing" && (
          <p className="text-xs text-zinc-500">
            Fetching repo tree and key files from GitHub, then sending to Gemini for analysis. This may take 15-30 seconds...
          </p>
        )}
        {error && <p className="text-xs text-red-400">{error}</p>}
      </form>

      {analysis && meta && <ResultView analysis={analysis} meta={meta} />}
    </div>
  );
}

function ResultView({ analysis, meta }: { analysis: RepoAnalysis; meta: Meta }) {
  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
        <div className="mb-2 flex items-baseline gap-2">
          <h2 className="text-xl font-bold text-zinc-100">
            {meta.owner}/{meta.repo}
          </h2>
          <span className="text-xs text-zinc-500">
            {meta.fileCount} files · {meta.analyzedFiles.length} analyzed
          </span>
        </div>
        <p className="text-sm leading-relaxed text-zinc-300">
          {analysis.overview}
        </p>
      </div>

      {/* Tech Stack */}
      <Section title="Tech Stack">
        <div className="flex flex-wrap gap-2">
          {analysis.techStack.map((t) => (
            <span
              key={t}
              className="rounded-lg border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-xs font-medium text-brand-400"
            >
              {t}
            </span>
          ))}
        </div>
      </Section>

      {/* Architecture */}
      <Section title="Architecture">
        <div className="prose prose-sm prose-invert max-w-none">
          {analysis.architecture.split("\n\n").map((p, i) => (
            <p key={i} className="text-sm leading-relaxed text-zinc-300">
              {p}
            </p>
          ))}
        </div>
      </Section>

      {/* Entry Points */}
      <Section title="Entry Points">
        <div className="flex flex-wrap gap-2">
          {analysis.entryPoints.map((ep) => (
            <code
              key={ep}
              className="rounded-md bg-zinc-800/80 px-2 py-1 font-mono text-xs text-zinc-300"
            >
              {ep}
            </code>
          ))}
        </div>
      </Section>

      {/* Key Files */}
      <Section title="Key Files">
        <div className="flex flex-col gap-2">
          {analysis.keyFiles.map((f) => (
            <div
              key={f.path}
              className="flex gap-3 rounded-lg border border-zinc-800/60 bg-zinc-950/40 px-4 py-3"
            >
              <code className="shrink-0 font-mono text-xs text-brand-400">
                {f.path}
              </code>
              <span className="text-xs text-zinc-400">{f.purpose}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Design Patterns */}
      <Section title="Design Patterns & Conventions">
        <ul className="flex flex-col gap-2">
          {analysis.patterns.map((p, i) => (
            <li key={i} className="flex gap-2 text-sm text-zinc-300">
              <span className="text-brand-500">•</span>
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </Section>

      {/* Analyzed Files */}
      <Section title="Files Analyzed">
        <div className="flex flex-wrap gap-1.5">
          {meta.analyzedFiles.map((f) => (
            <code
              key={f}
              className="rounded-md bg-zinc-800/60 px-2 py-0.5 font-mono text-[11px] text-zinc-500"
            >
              {f}
            </code>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      <h3 className="mb-3 text-sm font-semibold text-zinc-200">{title}</h3>
      {children}
    </div>
  );
}

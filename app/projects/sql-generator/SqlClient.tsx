"use client";

import { useMemo, useState, type FormEvent } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/authContext";
import type { SampleSchema } from "@/modules/sql-generator/sampleSchemas";
import type { GenerateResult } from "@/modules/sql-generator/schemas";
import type { QueryResult } from "@/modules/sql-generator/sandbox";

type Status = "idle" | "generating" | "executing" | "error";

type Props = {
  samples: SampleSchema[];
};

export function SqlClient({ samples }: Props) {
  const { authFetch } = useAuth();
  const [selectedSlug, setSelectedSlug] = useState(samples[0]?.slug ?? "");
  const selected = useMemo(
    () => samples.find((s) => s.slug === selectedSlug),
    [selectedSlug, samples]
  );
  const [ddl, setDdl] = useState(selected?.ddl ?? "");
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [gen, setGen] = useState<GenerateResult | null>(null);
  const [exec, setExec] = useState<QueryResult | null>(null);

  function handleSampleChange(slug: string) {
    setSelectedSlug(slug);
    const next = samples.find((s) => s.slug === slug);
    if (next) {
      setDdl(next.ddl);
      setGen(null);
      setExec(null);
    }
  }

  async function handleGenerate(e: FormEvent) {
    e.preventDefault();
    if (!ddl.trim() || !question.trim()) return;
    setStatus("generating");
    setError(null);
    setGen(null);
    setExec(null);

    try {
      const res = await authFetch("/api/projects/sql-generator/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schema: ddl, question }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      setGen(data.result);
      setStatus("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
      setStatus("error");
    }
  }

  async function handleExecute() {
    if (!gen?.sql || !selected) return;
    setStatus("executing");
    setError(null);
    setExec(null);

    try {
      const res = await authFetch("/api/projects/sql-generator/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ddl,
          seed: selected.seed,
          query: gen.sql,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Execution failed");
      setExec(data.result);
      setStatus("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Execution failed");
      setStatus("error");
    }
  }

  const isBusy = status === "generating" || status === "executing";

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={handleGenerate} className="flex flex-col gap-6">
        <Section
          step={1}
          title="Choose a schema"
          hint="Pick a preset or edit the DDL directly"
          accent="from-cyan-500/40 to-transparent"
        >
          <div className="mb-3 flex flex-wrap gap-2">
            {samples.map((s) => (
              <button
                key={s.slug}
                type="button"
                onClick={() => handleSampleChange(s.slug)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
                  selectedSlug === s.slug
                    ? "border-brand-500/60 bg-brand-500/15 text-brand-500 shadow-[0_0_20px_-5px_rgba(99,102,241,0.5)]"
                    : "border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:-translate-y-0.5 hover:border-zinc-600 hover:text-zinc-200"
                )}
              >
                {s.name}
              </button>
            ))}
          </div>
          {selected && (
            <p className="mb-3 text-xs text-zinc-500">{selected.description}</p>
          )}
          <div className="relative">
            <div className="pointer-events-none absolute left-0 top-0 flex h-full flex-col items-center gap-1 rounded-l-lg border-r border-zinc-800 bg-zinc-900/60 px-2 py-3 font-mono text-[10px] text-zinc-600">
              {Array.from({ length: 10 }).map((_, i) => (
                <span key={i}>{i + 1}</span>
              ))}
            </div>
            <textarea
              value={ddl}
              onChange={(e) => setDdl(e.target.value)}
              rows={10}
              disabled={isBusy}
              spellCheck={false}
              className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-950/70 p-3 pl-10 font-mono text-xs leading-relaxed text-zinc-200 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </div>
        </Section>

        <Section
          step={2}
          title="Ask a question"
          hint="In plain English — try one of the examples"
          accent="from-brand-500/40 to-transparent"
        >
          {selected && (
            <div className="mb-3 flex flex-wrap gap-2">
              {selected.exampleQuestions.map((q, i) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQuestion(q)}
                  className="animate-fade-up rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 text-[11px] text-zinc-400 transition-all hover:-translate-y-0.5 hover:border-brand-500/60 hover:bg-brand-500/10 hover:text-brand-500"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  {q}
                </button>
              ))}
            </div>
          )}
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-brand-500/70">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </span>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. Top 3 customers by total spend"
              disabled={isBusy}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2.5 pl-9 text-sm text-zinc-200 placeholder:text-zinc-600 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </div>
        </Section>

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="submit"
            disabled={isBusy || !ddl.trim() || !question.trim()}
            className="group relative inline-flex items-center gap-2 overflow-hidden rounded-lg bg-gradient-to-r from-cyan-500 via-brand-500 to-fuchsia-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-500/30 transition-transform hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
          >
            <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            {status === "generating" ? (
              <>
                <Spinner /> Generating...
              </>
            ) : (
              <>
                Generate SQL
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </>
            )}
          </button>
          {error && (
            <span className="rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs text-red-400">
              {error}
            </span>
          )}
        </div>
      </form>

      {gen && (
        <ResultView
          gen={gen}
          exec={exec}
          executing={status === "executing"}
          onExecute={handleExecute}
        />
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function Section({
  step,
  title,
  hint,
  accent,
  children,
}: {
  step: number;
  title: string;
  hint?: string;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-5 backdrop-blur-sm transition-colors hover:border-zinc-700">
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r opacity-80",
          accent ?? "from-brand-500/30 to-transparent"
        )}
      />
      <div className="mb-4 flex items-center gap-3">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-brand-500/20 to-fuchsia-500/10 text-xs font-bold text-brand-500 ring-1 ring-brand-500/30">
          {step}
        </span>
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
          {hint && <p className="text-xs text-zinc-500">{hint}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function ResultView({
  gen,
  exec,
  executing,
  onExecute,
}: {
  gen: GenerateResult;
  exec: QueryResult | null;
  executing: boolean;
  onExecute: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(gen.sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="animate-fade-up flex flex-col gap-6 rounded-2xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-6 backdrop-blur-sm sm:p-8">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
            </div>
            <h3 className="ml-2 font-mono text-xs text-zinc-500">query.sql</h3>
          </div>
          <button
            onClick={copy}
            className={cn(
              "rounded-md border px-2.5 py-1 text-[11px] font-medium transition-all",
              copied
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                : "border-zinc-800 text-zinc-400 hover:border-brand-500/60 hover:text-brand-500"
            )}
          >
            {copied ? "✓ Copied" : "Copy"}
          </button>
        </div>
        <pre className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950/90 p-4 font-mono text-xs leading-relaxed text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <code>{gen.sql}</code>
        </pre>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand-500/90">
          Explanation
        </h4>
        <p className="text-sm leading-relaxed text-zinc-300">{gen.explanation}</p>
      </div>

      {gen.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-400">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Warnings
          </h4>
          <ul className="flex flex-col gap-1 text-xs text-amber-200/90">
            {gen.warnings.map((w, i) => (
              <li key={i} className="flex gap-2">
                <span>•</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-zinc-800/80 pt-4">
        <button
          type="button"
          onClick={onExecute}
          disabled={executing}
          className="group inline-flex items-center gap-2 rounded-lg border border-brand-500/60 bg-brand-500/10 px-4 py-2 text-xs font-semibold text-brand-500 transition-all hover:-translate-y-0.5 hover:bg-brand-500/20 disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {executing ? (
            <>
              <Spinner /> Running...
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
              Run on sample data
            </>
          )}
        </button>
        {exec && (
          <span className="inline-flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 text-xs text-zinc-400">
            <span className="text-emerald-400">●</span>
            {exec.rowCount} row{exec.rowCount === 1 ? "" : "s"} ·{" "}
            <span className="font-mono text-zinc-500">{exec.elapsedMs}ms</span>
            {exec.truncated && " · first 100"}
          </span>
        )}
      </div>

      {exec && exec.columns.length > 0 && <ResultTable result={exec} />}
      {exec && exec.columns.length === 0 && (
        <p className="text-xs italic text-zinc-500">Query returned no rows.</p>
      )}
    </div>
  );
}

function ResultTable({ result }: { result: QueryResult }) {
  return (
    <div className="animate-fade-up overflow-x-auto rounded-lg border border-zinc-800">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-gradient-to-b from-zinc-900 to-zinc-900/80 backdrop-blur">
          <tr>
            {result.columns.map((col) => (
              <th
                key={col}
                className="border-b border-zinc-800 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-300"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-zinc-800/60 transition-colors last:border-0 hover:bg-brand-500/5"
            >
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2 font-mono text-zinc-300">
                  {cell === null ? (
                    <span className="italic text-zinc-600">null</span>
                  ) : (
                    String(cell)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

"use client";

import { useMemo, useState, type FormEvent } from "react";
import { cn } from "@/lib/utils";
import type { SampleSchema } from "@/modules/sql-generator/sampleSchemas";
import type { GenerateResult } from "@/modules/sql-generator/schemas";
import type { QueryResult } from "@/modules/sql-generator/sandbox";

type Status = "idle" | "generating" | "executing" | "error";

type Props = {
  samples: SampleSchema[];
};

export function SqlClient({ samples }: Props) {
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
      const res = await fetch("/api/projects/sql-generator/generate", {
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
      const res = await fetch("/api/projects/sql-generator/execute", {
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
          title="1. Choose a schema"
          hint="Pick a preset or edit the DDL directly"
        >
          <div className="mb-3 flex flex-wrap gap-2">
            {samples.map((s) => (
              <button
                key={s.slug}
                type="button"
                onClick={() => handleSampleChange(s.slug)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                  selectedSlug === s.slug
                    ? "border-brand-500 bg-brand-500/10 text-brand-500"
                    : "border-zinc-800 text-zinc-400 hover:border-zinc-700"
                )}
              >
                {s.name}
              </button>
            ))}
          </div>
          {selected && (
            <p className="mb-3 text-xs text-zinc-500">{selected.description}</p>
          )}
          <textarea
            value={ddl}
            onChange={(e) => setDdl(e.target.value)}
            rows={10}
            disabled={isBusy}
            spellCheck={false}
            className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 font-mono text-xs leading-relaxed text-zinc-200 focus:border-brand-500 focus:outline-none"
          />
        </Section>

        <Section
          title="2. Ask a question"
          hint="In plain English — try one of the examples"
        >
          {selected && (
            <div className="mb-3 flex flex-wrap gap-2">
              {selected.exampleQuestions.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQuestion(q)}
                  className="rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 text-[11px] text-zinc-400 hover:border-brand-500 hover:text-brand-500"
                >
                  {q}
                </button>
              ))}
            </div>
          )}
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. Top 3 customers by total spend"
            disabled={isBusy}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-brand-500 focus:outline-none"
          />
        </Section>

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={isBusy || !ddl.trim() || !question.trim()}
            className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === "generating" ? "Generating..." : "Generate SQL"}
          </button>
          {error && <span className="text-xs text-red-400">{error}</span>}
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

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>
        {hint && <p className="text-xs text-zinc-500">{hint}</p>}
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
    <div className="flex flex-col gap-5 rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-200">Generated SQL</h3>
          <button
            onClick={copy}
            className="rounded-md border border-zinc-800 px-2 py-1 text-[11px] text-zinc-400 hover:border-brand-500 hover:text-brand-500"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <pre className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950/80 p-4 font-mono text-xs leading-relaxed text-zinc-100">
          {gen.sql}
        </pre>
      </div>

      <div>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Explanation
        </h4>
        <p className="text-sm leading-relaxed text-zinc-300">
          {gen.explanation}
        </p>
      </div>

      {gen.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-400">
            Warnings
          </h4>
          <ul className="flex flex-col gap-1 text-xs text-amber-200/90">
            {gen.warnings.map((w, i) => (
              <li key={i}>• {w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-3 border-t border-zinc-800 pt-4">
        <button
          type="button"
          onClick={onExecute}
          disabled={executing}
          className="rounded-lg border border-brand-500 px-4 py-2 text-xs font-medium text-brand-500 transition hover:bg-brand-500/10 disabled:opacity-50"
        >
          {executing ? "Running..." : "Run on sample data"}
        </button>
        {exec && (
          <span className="text-xs text-zinc-500">
            {exec.rowCount} row{exec.rowCount === 1 ? "" : "s"} · {exec.elapsedMs}ms
            {exec.truncated && " (showing first 100)"}
          </span>
        )}
      </div>

      {exec && exec.columns.length > 0 && (
        <ResultTable result={exec} />
      )}
      {exec && exec.columns.length === 0 && (
        <p className="text-xs text-zinc-500">Query returned no rows.</p>
      )}
    </div>
  );
}

function ResultTable({ result }: { result: QueryResult }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-800">
      <table className="w-full text-xs">
        <thead className="bg-zinc-900/80">
          <tr>
            {result.columns.map((col) => (
              <th
                key={col}
                className="border-b border-zinc-800 px-3 py-2 text-left font-semibold text-zinc-300"
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
              className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-900/40"
            >
              {row.map((cell, j) => (
                <td
                  key={j}
                  className="px-3 py-2 font-mono text-zinc-400"
                >
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

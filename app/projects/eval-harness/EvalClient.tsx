"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { SuiteResult, EvalResult } from "@/modules/eval-harness/schemas";

type Status = "idle" | "running" | "done" | "error";

export function EvalClient() {
  const [projects, setProjects] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SuiteResult | null>(null);

  useEffect(() => {
    fetch("/api/projects/eval-harness/run")
      .then((r) => r.json())
      .then((d) => {
        setProjects(d.projects ?? []);
        if (d.projects?.length > 0) setSelected(d.projects[0]);
      });
  }, []);

  async function handleRun() {
    if (!selected) return;
    setStatus("running");
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/projects/eval-harness/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectSlug: selected }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Eval failed");
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eval failed");
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Controls */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-xs text-zinc-500">
              Project to evaluate
            </label>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={status === "running"}
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-200"
            >
              {projects.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleRun}
            disabled={status === "running" || !selected}
            className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            {status === "running" ? "Running tests..." : "Run Test Suite"}
          </button>
          {status === "running" && (
            <span className="text-xs text-zinc-500">
              Running test cases and judging outputs. This takes 30-60 seconds...
            </span>
          )}
          {error && <span className="text-xs text-red-400">{error}</span>}
        </div>
      </div>

      {/* Results */}
      {result && <SuiteResultView result={result} />}
    </div>
  );
}

function SuiteResultView({ result }: { result: SuiteResult }) {
  return (
    <div className="flex flex-col gap-6">
      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Project" value={result.project} />
        <StatCard
          label="Pass Rate"
          value={`${result.passRate}%`}
          tone={result.passRate >= 80 ? "good" : result.passRate >= 50 ? "warn" : "bad"}
        />
        <StatCard
          label="Avg Score"
          value={`${result.avgScore}/10`}
          tone={result.avgScore >= 7 ? "good" : result.avgScore >= 4 ? "warn" : "bad"}
        />
        <StatCard
          label="Total Time"
          value={`${(result.totalLatencyMs / 1000).toFixed(1)}s`}
        />
      </div>

      {/* Per-test results */}
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-zinc-200">Test Results</h3>
        {result.results.map((r, i) => (
          <TestResultCard key={i} result={r} />
        ))}
      </div>
    </div>
  );
}

function TestResultCard({ result }: { result: EvalResult }) {
  const [expanded, setExpanded] = useState(false);
  const j = result.judgment;

  return (
    <div
      className={cn(
        "rounded-xl border bg-zinc-900/40 p-5",
        j.pass
          ? "border-emerald-500/30"
          : "border-red-500/30"
      )}
    >
      <div
        className="flex cursor-pointer items-center justify-between"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
              j.pass
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-red-500/15 text-red-400"
            )}
          >
            {j.pass ? "P" : "F"}
          </span>
          <div>
            <h4 className="text-sm font-medium text-zinc-200">
              {result.testCase.name}
            </h4>
            <p className="text-xs text-zinc-500">
              Score: {j.score}/10 · {result.latencyMs}ms
              {result.error && " · ERROR"}
            </p>
          </div>
        </div>
        <span className="text-xs text-zinc-600">
          {expanded ? "▲" : "▼"}
        </span>
      </div>

      {expanded && (
        <div className="mt-4 flex flex-col gap-3 border-t border-zinc-800 pt-4">
          <div>
            <h5 className="mb-1 text-xs font-semibold text-zinc-500">
              Expected Behavior
            </h5>
            <p className="text-xs text-zinc-400">
              {result.testCase.expectedBehavior}
            </p>
          </div>
          <div>
            <h5 className="mb-1 text-xs font-semibold text-zinc-500">
              Judge Reasoning
            </h5>
            <p className="text-xs text-zinc-300">{j.reasoning}</p>
          </div>
          {j.issues.length > 0 && (
            <div>
              <h5 className="mb-1 text-xs font-semibold text-zinc-500">
                Issues
              </h5>
              <ul className="flex flex-col gap-1 text-xs text-red-400">
                {j.issues.map((issue, i) => (
                  <li key={i}>• {issue}</li>
                ))}
              </ul>
            </div>
          )}
          <details className="text-xs">
            <summary className="cursor-pointer text-zinc-600 hover:text-zinc-400">
              Raw output
            </summary>
            <pre className="mt-2 max-h-60 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950/80 p-3 font-mono text-[11px] text-zinc-500">
              {JSON.stringify(result.output, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "warn" | "bad";
}) {
  const color =
    tone === "good"
      ? "text-emerald-400"
      : tone === "warn"
      ? "text-amber-400"
      : tone === "bad"
      ? "text-red-400"
      : "text-zinc-100";

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={cn("mt-1 text-xl font-bold tabular-nums", color)}>
        {value}
      </div>
    </div>
  );
}

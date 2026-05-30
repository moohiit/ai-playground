import { EvalClient } from "./EvalClient";

export const metadata = {
  title: "LLM Eval Harness · AI Playground",
  description:
    "Run test suites against AI projects with LLM-as-judge scoring.",
};

export default function EvalHarnessPage() {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <a href="/" className="text-xs text-zinc-500 hover:text-zinc-300">
          ← Back to projects
        </a>
        <h1 className="text-3xl font-bold tracking-tight">LLM Eval Harness</h1>
        <p className="max-w-2xl text-sm text-zinc-400">
          Run predefined test suites against AI projects. Each test sends
          real input, captures the output, then uses Gemini-as-judge to
          score quality. See pass rates, per-test reasoning, and issues.
        </p>
      </header>
      <EvalClient />
    </div>
  );
}

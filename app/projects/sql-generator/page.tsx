import { SqlClient } from "./SqlClient";
import { SAMPLE_SCHEMAS } from "@/modules/sql-generator/sampleSchemas";

export const metadata = {
  title: "Natural Language → SQL · AI Playground",
  description:
    "Describe what you want in plain English and get valid SQL plus safe execution on sample data.",
};

export default function SqlGeneratorPage() {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <a href="/" className="text-xs text-zinc-500 hover:text-zinc-300">
          ← Back to projects
        </a>
        <h1 className="text-3xl font-bold tracking-tight">
          Natural Language → SQL
        </h1>
        <p className="max-w-2xl text-sm text-zinc-400">
          Pick a sample schema (or paste your own), ask a question in plain
          English, and Gemini writes a SQL query. You can run it safely on
          in-memory sample data — only SELECT queries are ever executed.
        </p>
      </header>
      <SqlClient samples={SAMPLE_SCHEMAS} />
    </div>
  );
}

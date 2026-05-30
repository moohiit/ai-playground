"use client";

import { useState, type FormEvent } from "react";
import { cn } from "@/lib/utils";
import type { ScrapeResult } from "@/modules/web-agent/schemas";

type Status = "idle" | "scraping" | "done" | "error";

export function WebAgentClient() {
  const [url, setUrl] = useState("");
  const [instruction, setInstruction] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!url.trim() || !instruction.trim()) return;
    setStatus("scraping");
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/projects/web-agent/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), instruction: instruction.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Scraping failed");
      setResult(data.result);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scraping failed");
      setStatus("error");
    }
  }

  async function handleCopy() {
    if (!result) return;
    await navigator.clipboard.writeText(JSON.stringify(result.data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleExportCSV() {
    if (!result || result.data.length === 0) return;
    const headers = result.fieldNames;
    const rows = result.data.map((row) =>
      headers.map((h) => {
        const val = row[h];
        const str = val === null || val === undefined ? "" : String(val);
        return str.includes(",") || str.includes('"')
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      })
    );
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "scraped-data.csv";
    a.click();
  }

  const isBusy = status === "scraping";

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-xs text-zinc-500">
                URL to scrape
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/products"
                required
                disabled={isBusy}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-brand-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">
                What data do you want?
              </label>
              <input
                type="text"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="e.g. Extract all product names, prices, and ratings"
                required
                disabled={isBusy}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-brand-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={isBusy || !url.trim() || !instruction.trim()}
            className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isBusy ? "Scraping..." : "Extract Data"}
          </button>
          {isBusy && (
            <span className="text-xs text-zinc-500">
              Fetching page and extracting data...
            </span>
          )}
          {error && <span className="text-xs text-red-400">{error}</span>}
        </div>
      </form>

      {result && (
        <div className="flex flex-col gap-5 rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zinc-200">
                Extracted Data
              </h3>
              <p className="text-xs text-zinc-500">
                {result.itemCount} items · {result.summary}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="rounded-md border border-zinc-800 px-3 py-1.5 text-[11px] text-zinc-400 hover:border-brand-500 hover:text-brand-500"
              >
                {copied ? "Copied!" : "Copy JSON"}
              </button>
              <button
                onClick={handleExportCSV}
                className="rounded-md border border-zinc-800 px-3 py-1.5 text-[11px] text-zinc-400 hover:border-brand-500 hover:text-brand-500"
              >
                Export CSV
              </button>
            </div>
          </div>

          {result.data.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-zinc-800">
              <table className="w-full text-xs">
                <thead className="bg-zinc-900/80">
                  <tr>
                    {result.fieldNames.map((h) => (
                      <th
                        key={h}
                        className="border-b border-zinc-800 px-3 py-2 text-left font-semibold text-zinc-300"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((row, i) => (
                    <tr
                      key={i}
                      className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-900/40"
                    >
                      {result.fieldNames.map((h) => (
                        <td key={h} className="px-3 py-2 text-zinc-400">
                          {row[h] === null || row[h] === undefined ? (
                            <span className="italic text-zinc-600">null</span>
                          ) : (
                            String(row[h])
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <details className="text-xs">
            <summary className="cursor-pointer text-zinc-500 hover:text-zinc-300">
              View raw JSON
            </summary>
            <pre className="mt-2 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950/80 p-4 font-mono text-zinc-400">
              {JSON.stringify(result.data, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}

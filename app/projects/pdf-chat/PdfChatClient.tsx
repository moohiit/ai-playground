"use client";

export function PdfChatClient() {
  return (
    <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 backdrop-blur-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs uppercase tracking-[0.18em] text-zinc-500">
            Documents
          </h2>
        </div>
        <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-950/40 p-6 text-center text-xs text-zinc-500">
          Upload flow lands in Step 2.
        </div>
      </aside>

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-6 backdrop-blur-sm">
        <div className="flex h-[480px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-zinc-800 bg-zinc-950/40 text-center">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/60 text-zinc-500">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <p className="max-w-sm text-sm text-zinc-400">
            Upload a PDF (up to 6 MB, 40 pages) and the retrieval pipeline
            wires up in the next steps.
          </p>
        </div>
      </section>
    </div>
  );
}

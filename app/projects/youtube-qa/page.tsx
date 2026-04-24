import Link from "next/link";
import { YoutubeQaClient } from "./YoutubeQaClient";

export const metadata = {
  title: "YouTube Q&A · AI Playground",
  description:
    "Paste a YouTube URL and ask grounded questions about the video. Answers cite back to timestamps in the transcript.",
};

export default function YoutubeQaPage() {
  return (
    <div className="relative flex flex-col gap-10">
      <div className="pointer-events-none absolute inset-x-0 -top-20 -z-10 h-[380px] bg-grid bg-radial-fade opacity-70" />
      <div className="pointer-events-none absolute -top-16 left-1/3 -z-10 h-[320px] w-[320px] rounded-full bg-red-500/15 blur-3xl animate-blob" />
      <div className="pointer-events-none absolute -top-10 right-10 -z-10 h-[260px] w-[260px] rounded-full bg-brand-500/15 blur-3xl animate-blob [animation-delay:-6s]" />

      <header className="flex flex-col gap-3 animate-fade-up">
        <Link
          href="/"
          className="group inline-flex w-fit items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-brand-500"
        >
          <span className="transition-transform group-hover:-translate-x-1">
            ←
          </span>
          Back to projects
        </Link>
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-red-400/90 backdrop-blur">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 animate-pulse-ring" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-400" />
          </span>
          Transcripts · RAG · Timestamps
        </div>
        <h1 className="text-balance text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          YouTube <span className="text-gradient-brand">Q&A</span>
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-zinc-400 sm:text-base">
          Paste any YouTube URL, ask questions in plain English, and get
          answers grounded in the transcript — with clickable timestamp
          citations that jump the player to the exact moment.
        </p>
      </header>

      <YoutubeQaClient />
    </div>
  );
}

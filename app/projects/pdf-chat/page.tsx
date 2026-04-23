import Link from "next/link";
import { PdfChatClient } from "./PdfChatClient";

export const metadata = {
  title: "PDF Chat · AI Playground",
  description:
    "Upload a PDF and ask grounded questions about it — retrieval-augmented answers with page-level citations.",
};

export default function PdfChatPage() {
  return (
    <div className="relative flex flex-col gap-10">
      <div className="pointer-events-none absolute inset-x-0 -top-20 -z-10 h-[380px] bg-grid bg-radial-fade opacity-70" />
      <div className="pointer-events-none absolute -top-16 left-1/3 -z-10 h-[320px] w-[320px] rounded-full bg-cyan-500/15 blur-3xl animate-blob" />
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
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-cyan-400/90 backdrop-blur">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 animate-pulse-ring" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan-400" />
          </span>
          RAG · Embeddings · Citations
        </div>
        <h1 className="text-balance text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          <span className="text-gradient-brand">PDF</span> Chat
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-zinc-400 sm:text-base">
          Upload a PDF, ask questions in plain English, and get answers
          grounded in the document — with inline citations pointing back to
          the exact pages.
        </p>
      </header>

      <PdfChatClient />
    </div>
  );
}

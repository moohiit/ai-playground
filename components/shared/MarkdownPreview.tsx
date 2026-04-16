"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

export function MarkdownPreview({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "prose prose-invert max-w-none",
        "prose-headings:scroll-mt-24 prose-headings:tracking-tight",
        "prose-h1:text-3xl prose-h1:font-bold prose-h1:text-zinc-100",
        "prose-h2:mt-8 prose-h2:text-xl prose-h2:font-semibold prose-h2:text-zinc-100",
        "prose-h3:text-base prose-h3:font-semibold prose-h3:text-zinc-200",
        "prose-p:leading-relaxed prose-p:text-zinc-300",
        "prose-strong:text-zinc-100",
        "prose-a:text-brand-400 hover:prose-a:text-brand-300",
        "prose-code:rounded prose-code:bg-zinc-900/80 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:text-zinc-200 prose-code:before:hidden prose-code:after:hidden",
        "prose-pre:rounded-lg prose-pre:border prose-pre:border-zinc-800 prose-pre:bg-zinc-950",
        "prose-blockquote:border-l-brand-500/60 prose-blockquote:text-zinc-400",
        "prose-ul:text-zinc-300 prose-ol:text-zinc-300 prose-li:marker:text-brand-500/70",
        "prose-hr:border-zinc-800",
        className
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
    </div>
  );
}

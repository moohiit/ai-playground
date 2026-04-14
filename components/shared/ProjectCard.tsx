"use client";

import Link from "next/link";
import { useRef } from "react";
import { cn } from "@/lib/utils";

export type ProjectCardProps = {
  title: string;
  description: string;
  tags: string[];
  href: string;
  status: "live" | "coming-soon";
};

export function ProjectCard({
  title,
  description,
  tags,
  href,
  status,
}: ProjectCardProps) {
  const isLive = status === "live";
  const ref = useRef<HTMLDivElement>(null);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - rect.left}px`);
    el.style.setProperty("--my", `${e.clientY - rect.top}px`);
  }

  const content = (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      className={cn(
        "card-spotlight group relative flex h-full flex-col overflow-hidden rounded-xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-6 backdrop-blur-sm transition-all duration-300",
        isLive
          ? "hover:-translate-y-1 hover:border-brand-500/60 hover:shadow-[0_20px_60px_-15px_rgba(99,102,241,0.35)]"
          : "opacity-60"
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-brand-500/60 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

      <div className="relative mb-3 flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-zinc-100 transition-colors group-hover:text-white">
          {title}
        </h3>
        <span
          className={cn(
            "relative flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
            isLive
              ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/30"
              : "bg-zinc-800 text-zinc-400"
          )}
        >
          {isLive && (
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 animate-pulse-ring" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
          )}
          {isLive ? "Live" : "Soon"}
        </span>
      </div>

      <p className="relative mb-4 flex-1 text-sm leading-relaxed text-zinc-400">
        {description}
      </p>

      <div className="relative mb-4 flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-0.5 text-[11px] text-zinc-400 transition-colors group-hover:border-brand-500/30 group-hover:text-zinc-300"
          >
            {tag}
          </span>
        ))}
      </div>

      <span
        className={cn(
          "relative inline-flex items-center gap-1 text-sm font-medium",
          isLive ? "text-brand-500" : "text-zinc-600"
        )}
      >
        {isLive ? (
          <>
            Try it
            <span className="transition-transform duration-300 group-hover:translate-x-1">
              →
            </span>
          </>
        ) : (
          "Coming soon"
        )}
      </span>
    </div>
  );

  if (!isLive) return content;
  return (
    <Link href={href} className="block h-full">
      {content}
    </Link>
  );
}

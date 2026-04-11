import Link from "next/link";
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

  const content = (
    <div
      className={cn(
        "group flex h-full flex-col rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 transition",
        isLive
          ? "hover:border-brand-500 hover:bg-zinc-900/70"
          : "opacity-60"
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-zinc-100">{title}</h3>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
            isLive
              ? "bg-brand-500/15 text-brand-500"
              : "bg-zinc-800 text-zinc-400"
          )}
        >
          {isLive ? "Live" : "Soon"}
        </span>
      </div>
      <p className="mb-4 flex-1 text-sm leading-relaxed text-zinc-400">
        {description}
      </p>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="rounded-md bg-zinc-800/80 px-2 py-0.5 text-[11px] text-zinc-400"
          >
            {tag}
          </span>
        ))}
      </div>
      <span
        className={cn(
          "text-sm font-medium",
          isLive
            ? "text-brand-500 group-hover:text-brand-500"
            : "text-zinc-600"
        )}
      >
        {isLive ? "Try it →" : "Coming soon"}
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

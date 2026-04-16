"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function CopyButton({
  value,
  label = "Copy",
  size = "sm",
  className,
}: {
  value: string;
  label?: string;
  size?: "sm" | "xs";
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // noop — clipboard may be blocked
    }
  }

  const sizeClasses =
    size === "xs"
      ? "h-6 px-2 text-[10px]"
      : "h-7 px-2.5 text-xs";

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={!value}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900/60 font-medium uppercase tracking-wider text-zinc-400 transition hover:border-brand-500/40 hover:text-brand-300 disabled:cursor-not-allowed disabled:opacity-40",
        sizeClasses,
        copied && "border-emerald-500/40 text-emerald-400 hover:text-emerald-400",
        className
      )}
      aria-label={copied ? "Copied" : label}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

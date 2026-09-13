"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { NavAuth } from "./NavAuth";

const SCROLL_TOP_THRESHOLD = 20;
const HIDE_AFTER = 80;
const DIRECTION_DELTA = 4;

export function SiteHeader() {
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    let ticking = false;

    const handler = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - lastY;

        setScrolled(y > SCROLL_TOP_THRESHOLD);

        if (y < HIDE_AFTER) {
          setHidden(false);
        } else if (delta > DIRECTION_DELTA) {
          setHidden(true);
        } else if (delta < -DIRECTION_DELTA) {
          setHidden(false);
        }

        lastY = y;
        ticking = false;
      });
    };

    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 -mx-4 px-4 sm:-mx-6 sm:px-6 transition-[transform,background-color,border-color] duration-300 will-change-transform",
        scrolled
          ? "border-b border-zinc-800/60 bg-zinc-950/70 backdrop-blur-xl"
          : "border-b border-transparent bg-transparent",
        hidden ? "-translate-y-full" : "translate-y-0"
      )}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between py-4">
        <Link
          href="/"
          className="shrink-0 whitespace-nowrap text-base font-semibold tracking-tight sm:text-lg"
        >
          AI <span className="text-brand-500">Playground</span>
        </Link>
        <nav className="flex min-w-0 items-center gap-3 text-sm text-zinc-400 sm:gap-4">
          <a
            href="https://github.com/moohiit/ai-playground"
            target="_blank"
            rel="noreferrer"
            className="shrink-0 hover:text-zinc-100"
          >
            GitHub
          </a>
          <NavAuth />
        </nav>
      </div>
    </header>
  );
}

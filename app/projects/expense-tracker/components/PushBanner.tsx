"use client";

import { useEffect, useState } from "react";
import { useBrowserPush } from "../useBrowserPush";

/**
 * A one-time, in-app invitation to turn on browser notifications.
 *
 * This is a "soft ask": it is our own banner, not the browser's prompt. The
 * real prompt only appears if the user clicks "Turn on" — their click — so it
 * is wanted when it shows. "Not now" costs nothing: it never touches the
 * browser permission, which, once blocked, a site can never ask for again.
 *
 * Shown only while the answer is still open (state "off"): never to someone
 * already subscribed, who blocked it, or whose browser cannot do it. Dismissal
 * is remembered per browser, because the permission is per browser too.
 */
const DISMISSED_KEY = "splitzy-push-banner-dismissed";

export function PushBanner() {
  const { state, busy, turnOn } = useBrowserPush();
  // Start hidden: localStorage is unreadable during server render, and a
  // banner that flashes and vanishes is worse than one that arrives a beat late.
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISSED_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      /* private mode: it will simply show again next visit */
    }
  }

  if (state !== "off" || dismissed) return null;

  return (
    <div
      role="region"
      aria-label="Turn on notifications"
      className="flex flex-col gap-3 rounded-xl border border-brand-500/30 bg-brand-500/10 p-4 sm:flex-row sm:items-center"
    >
      <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-brand-500/30 bg-brand-500/10 text-brand-300 sm:inline-flex">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-100">Know when your groups change</p>
        <p className="mt-0.5 text-xs leading-5 text-zinc-400">
          Get a notification in this browser when someone adds an expense, pays you back or reminds
          you, even when Splitzy isn’t open. You can turn it off any time in Settings.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={dismiss}
          disabled={busy}
          className="rounded-lg px-3 py-2 text-sm text-zinc-400 transition-colors hover:text-zinc-100 disabled:opacity-50"
        >
          Not now
        </button>
        <button
          type="button"
          onClick={async () => {
            await turnOn();
            // Whatever they answered at the browser prompt, the question has
            // been put; do not put it again.
            dismiss();
          }}
          disabled={busy}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-500 disabled:opacity-50"
        >
          {busy ? "Working…" : "Turn on"}
        </button>
      </div>
    </div>
  );
}

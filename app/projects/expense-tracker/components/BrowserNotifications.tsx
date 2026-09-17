"use client";

import { useBrowserPush } from "../useBrowserPush";

/** The "notify me in this browser" switch in Settings. Logic: useBrowserPush. */
export function BrowserNotifications() {
  const { state, busy, turnOn, turnOff } = useBrowserPush();

  if (state === "checking") return <p className="text-sm text-zinc-500">Checking this browser…</p>;
  if (state === "unsupported")
    return (
      <p className="text-sm text-zinc-400">
        This browser doesn’t support push notifications. On iPhone and iPad, add the site to your
        Home Screen first (Share → Add to Home Screen), then open it from there.
      </p>
    );
  if (state === "unconfigured")
    return <p className="text-sm text-zinc-400">Browser notifications aren’t set up on the server yet.</p>;
  if (state === "blocked")
    return (
      <p className="text-sm text-amber-300/90">
        Notifications are blocked for this site. Click the padlock in the address bar, allow
        notifications, then reload.
      </p>
    );

  const on = state === "on";
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Browser notifications"
        disabled={busy}
        onClick={on ? turnOff : turnOn}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
          on ? "bg-brand-500" : "bg-zinc-700"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`}
        />
      </button>
      <span className="text-sm text-zinc-300">
        {busy ? "Working…" : on ? "On in this browser" : "Off in this browser"}
      </span>
    </div>
  );
}

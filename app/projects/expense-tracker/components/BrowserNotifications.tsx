"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../../../lib/authContext";
import { showAlert } from "../dialog";

/**
 * The "notify me in this browser" switch.
 *
 * Browser push is per browser, not per account: turning it on registers the
 * service worker (public/sw.js), asks the browser for permission, and sends
 * the resulting subscription to the server. After that, notifications arrive
 * whether or not a tab is open. The browser only shows its permission prompt
 * in response to a click, so nothing here runs on page load.
 */
type State =
  | "checking"
  | "unsupported" // no service worker / push API in this browser
  | "unconfigured" // server has no VAPID keys
  | "blocked" // user said no at the browser level
  | "off"
  | "on";

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function BrowserNotifications() {
  const { authFetch } = useAuth();
  const [state, setState] = useState<State>("checking");
  const [busy, setBusy] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setState("unsupported");
      return;
    }
    const res = await fetch("/api/push/web").catch(() => null);
    const cfg = res && res.ok ? ((await res.json().catch(() => ({}))) as { configured?: boolean; publicKey?: string }) : {};
    if (!cfg.configured || !cfg.publicKey) {
      setState("unconfigured");
      return;
    }
    setPublicKey(cfg.publicKey);
    if (Notification.permission === "denied") {
      setState("blocked");
      return;
    }
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    setState(sub && Notification.permission === "granted" ? "on" : "off");
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function turnOn() {
    if (!publicKey) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));
      const res = await authFetch("/api/push/web", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        await sub.unsubscribe().catch(() => undefined);
        showAlert(data.error ?? `Couldn't turn on notifications (HTTP ${res.status})`);
        return;
      }
      setState("on");
    } catch {
      showAlert("Couldn't turn on notifications in this browser.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await authFetch("/api/push/web", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => undefined);
        await sub.unsubscribe().catch(() => undefined);
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

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

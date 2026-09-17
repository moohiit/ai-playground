"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../../lib/authContext";
import { showAlert } from "./dialog";

/**
 * Browser push for this browser: what state it is in, and how to turn it on
 * or off. Shared by the Settings switch and the dashboard's one-time banner.
 *
 * Browser push is per browser, not per account: turning it on registers the
 * service worker (public/sw.js), asks the browser for permission, and sends
 * the resulting subscription to the server. After that, notifications arrive
 * whether or not a tab is open. `turnOn` must be called from a click — the
 * browser only shows its permission prompt in response to one, and a prompt
 * the user did not ask for tends to get a Block that can never be re-asked.
 */
export type PushState =
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

// Several components can mount this hook at once (banner + settings); when one
// changes the state the others should follow without a reload.
const CHANGED = "splitzy-push-changed";

export function useBrowserPush() {
  const { authFetch } = useAuth();
  const [state, setState] = useState<PushState>("checking");
  const [busy, setBusy] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setState("unsupported");
      return;
    }
    const res = await fetch("/api/push/web").catch(() => null);
    const cfg =
      res && res.ok
        ? ((await res.json().catch(() => ({}))) as { configured?: boolean; publicKey?: string })
        : {};
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
    const onChanged = () => void refresh();
    window.addEventListener(CHANGED, onChanged);
    return () => window.removeEventListener(CHANGED, onChanged);
  }, [refresh]);

  const announce = () => window.dispatchEvent(new Event(CHANGED));

  const turnOn = useCallback(async () => {
    if (!publicKey) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        announce();
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
      announce();
    } catch {
      showAlert("Couldn't turn on notifications in this browser.");
    } finally {
      setBusy(false);
    }
  }, [authFetch, publicKey]);

  const turnOff = useCallback(async () => {
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
      announce();
    } finally {
      setBusy(false);
    }
  }, [authFetch]);

  return { state, busy, turnOn, turnOff };
}

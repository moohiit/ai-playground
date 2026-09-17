import webpush from "web-push";
import { WebPushSubscription } from "./models";

/**
 * Browser push (the Web Push protocol), alongside Expo push for phones.
 *
 * A browser that granted permission hands over a subscription: an endpoint at
 * its vendor's push service plus two keys. Posting an encrypted payload there
 * wakes the site's service worker (public/sw.js), which shows the notification
 * — tab open or not, which is the point.
 *
 * Needs a VAPID key pair in the environment. Without one this module does
 * nothing, quietly: phones keep working and the settings toggle explains.
 */
export type WebSub = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

let configured: boolean | null = null;

export function webPushPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

function ensureConfigured(): boolean {
  if (configured !== null) return configured;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    configured = false;
    return false;
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:support@mohitpatel.org",
    publicKey,
    privateKey
  );
  configured = true;
  return true;
}

/** Where a click on the notification should land in the web app. */
function urlFor(data: Record<string, unknown>): string {
  const base = "/projects/expense-tracker";
  const tabs: Record<string, string> = {
    budgets: "Budgets",
    expenses: "Dashboard",
    recurring: "Recurring",
    groups: "Groups",
    notes: "Notes",
  };
  const screen = typeof data.screen === "string" ? data.screen : "";
  const tab = Object.prototype.hasOwnProperty.call(tabs, screen) ? tabs[screen] : null;
  if (!tab) return base;
  const params = new URLSearchParams({ tab });
  if (typeof data.groupId === "string" && /^[a-f0-9]{24}$/i.test(data.groupId)) {
    params.set("group", data.groupId);
  }
  return `${base}?${params.toString()}`;
}

export async function sendWebPush(
  subs: WebSub[],
  title: string,
  body: string,
  data: Record<string, unknown>
) {
  if (subs.length === 0 || !ensureConfigured()) return;
  const payload = JSON.stringify({ title, body, url: urlFor(data), tag: data.type ?? "splitzy" });

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(sub, payload, { TTL: 60 * 60 * 24 });
      } catch (err) {
        // 404 / 410: the browser dropped the subscription (permission revoked,
        // site data cleared). It will never work again, so forget it.
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await WebPushSubscription.deleteOne({ endpoint: sub.endpoint }).catch(() => undefined);
        }
      }
    })
  );
}

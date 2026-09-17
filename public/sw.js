/* Splitzy service worker: browser push only. No caching, no offline — it
   exists so a notification can arrive, and be clicked, with no tab open. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = { body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "Splitzy AI";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      // Same-kind notifications replace each other instead of stacking up.
      tag: payload.tag || "splitzy",
      renotify: true,
      data: { url: payload.url || "/projects/expense-tracker" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/projects/expense-tracker", self.location.origin);

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // An open tab on the app: bring it forward and tell it where to go,
      // rather than opening a second copy.
      const open = windows.find((w) => new URL(w.url).pathname.startsWith("/projects/expense-tracker"));
      if (open) {
        await open.focus();
        open.postMessage({
          type: "splitzy-navigate",
          tab: target.searchParams.get("tab"),
          group: target.searchParams.get("group"),
        });
        return;
      }
      await self.clients.openWindow(target.href);
    })()
  );
});

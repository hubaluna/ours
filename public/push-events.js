/* Notification handlers shared by the generated Workbox service worker. */
/* global self */

self.addEventListener("push", (event) => {
  const payload = (() => {
    if (!event.data) return {};
    try {
      return event.data.json();
    } catch {
      try {
        return { body: event.data.text() || "Є нове оновлення у вашому просторі." };
      } catch {
        return {};
      }
    }
  })();

  const title = payload.title || "ours.";
  const options = {
    body: payload.body || "Є нове оновлення у вашому просторі.",
    icon: new URL("icon-192.png", self.registration.scope).href,
    badge: new URL("favicon.png", self.registration.scope).href,
    tag: payload.tag || `ours-${Date.now()}`,
    data: { url: payload.url || self.registration.scope },
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    event.notification.data?.url || self.registration.scope,
    self.registration.scope,
  ).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows) {
        if (client.url.startsWith(self.registration.scope) && "focus" in client) {
          await client.focus();
          if ("navigate" in client && client.url !== target) {
            try {
              await client.navigate(target);
            } catch {
              /* iOS Safari PWA may reject navigate on an already-focused client */
            }
          }
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  const applicationServerKey =
    event.oldSubscription?.options?.applicationServerKey;
  if (!applicationServerKey || !self.registration?.pushManager) return;

  event.waitUntil(
    self.registration.pushManager
      .subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      })
      .catch(() => {
        /* App will re-sync subscription on next launch */
      }),
  );
});

/* Notification handlers shared by the generated Workbox service worker. */
/* global self */
self.addEventListener("push", (event) => {
  const payload = (() => {
    try {
      return event.data ? event.data.json() : {};
    } catch {
      return { body: event.data?.text() ?? "Є нове оновлення у вашому просторі." };
    }
  })();
  const title = payload.title || "ours.";
  const options = {
    body: payload.body || "Є нове оновлення у вашому просторі.",
    icon: new URL("icon-192.png", self.registration.scope).href,
    badge: new URL("favicon.png", self.registration.scope).href,
    tag: payload.tag || "ours-update",
    data: { url: payload.url || self.registration.scope },
    renotify: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || self.registration.scope, self.registration.scope).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (client.url.startsWith(self.registration.scope) && "focus" in client) {
        await client.focus();
        if ("navigate" in client) await client.navigate(target);
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});

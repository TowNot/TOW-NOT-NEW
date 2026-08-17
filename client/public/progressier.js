importScripts("https://progressier.app/Bv9Rb1Vm5PkATyh6w0wG/sw.js");

// Always showNotification on push, even when a /desk tab is focused.
self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let payload = {};
      try {
        payload = event.data ? event.data.json() : {};
      } catch {
        payload = {};
      }
      const nested = payload.notification || {};
      const data = payload.data || nested.data || {};
      const title = payload.title || nested.title || "AlertNav";
      const body = payload.body || payload.message || nested.body || nested.message || "";
      const url = payload.url || data.url || nested.url || "";
      const icon = payload.icon || nested.icon || "";
      // Always banner, including when a /desk tab is focused. Progressier's
      // imported handler may skip showNotification for visible clients.
      await self.registration.showNotification(title, {
        body,
        icon: icon || undefined,
        tag: url || title,
        renotify: true,
        data: { url },
      });
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows) {
        client.postMessage({
          type: "tow-not-alert",
          title,
          body,
          url,
        });
      }
    })(),
  );
});

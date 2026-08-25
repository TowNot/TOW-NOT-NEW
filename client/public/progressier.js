importScripts("https://progressier.app/Bv9Rb1Vm5PkATyh6w0wG/sw.js");

/**
 * Progressier's imported SW already calls showNotification on push.
 * A second showNotification here (especially with renotify:true) produced
 * identical duplicate lock-screen banners. This handler only forwards to
 * open clients for in-app bridging — it must NOT show another OS notification.
 */
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

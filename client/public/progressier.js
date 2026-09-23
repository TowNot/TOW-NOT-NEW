importScripts("https://progressier.app/Bv9Rb1Vm5PkATyh6w0wG/sw.js");

/**
 * Progressier's imported SW already calls showNotification on push.
 * A second showNotification here (especially with renotify:true) produced
 * identical duplicate lock-screen banners. This handler only forwards to
 * open clients for in-app bridging — it must NOT show another OS notification.
 *
 * Also stash the deep-link URL briefly so if iOS opens the PWA on `/`
 * (manifest start_url) instead of navigating to the notification URL, the
 * client can still send entitled users to the dashboard alert.
 */
const LAST_PUSH_CACHE = "alertnav-push-nav";
const LAST_PUSH_REQ = "/__alertnav_last_push_url";

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
      if (url) {
        try {
          const cache = await caches.open(LAST_PUSH_CACHE);
          await cache.put(
            new Request(LAST_PUSH_REQ),
            new Response(
              JSON.stringify({ url, at: Date.now() }),
              { headers: { "Content-Type": "application/json" } },
            ),
          );
        } catch {
          // Ignore Cache Storage failures — deep-link still works when OS honors url.
        }
      }
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

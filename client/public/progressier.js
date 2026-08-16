importScripts("https://progressier.app/Bv9Rb1Vm5PkATyh6w0wG/sw.js");

// Progressier's handler above renders the notification. This listener only
// forwards the payload to open windows so the app can play the TOW-NOT
// dispatch tone instead of the platform's generic notification sound.
self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let payload = {};
      try {
        payload = event.data ? event.data.json() : {};
      } catch {
        payload = {};
      }
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows) {
        client.postMessage({
          type: "tow-not-alert",
          title: payload.title || "",
          body: payload.body || "",
        });
      }
    })(),
  );
});

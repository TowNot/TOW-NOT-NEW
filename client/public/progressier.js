importScripts("https://progressier.app/Bv9Rb1Vm5PkATyh6w0wG/sw.js");

// Progressier's handler above renders the notification and the device plays
// its notification sound. This listener only tells open windows which incident
// was announced, so the app can suppress its own dispatch tone and the
// operator never hears two sounds for one incident.
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
          url: payload.url || "",
        });
      }
    })(),
  );
});

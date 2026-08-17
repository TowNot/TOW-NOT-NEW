const shown = new Set<string>();

/**
 * Browser/OS notification for an incident. Never gated on tab focus,
 * document.hidden, or visibilityState — a focused /desk tab still banners.
 */
export function showIncidentNotification(input: {
  id?: string;
  title: string;
  body: string;
}): void {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;

  const key = input.id || `${input.title}\n${input.body}`;
  if (shown.has(key)) return;
  shown.add(key);

  const title = input.title.trim() || "AlertNav";
  const options: NotificationOptions = {
    body: input.body,
    tag: `alertnav-${key}`,
    renotify: true,
  };

  const viaPage = (): void => {
    try {
      new Notification(title, options);
    } catch {
      // Permission or browser policy; nothing else to do here.
    }
  };

  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    viaPage();
    return;
  }

  void navigator.serviceWorker.ready
    .then((registration) => registration.showNotification(title, options))
    .catch(viaPage);
}

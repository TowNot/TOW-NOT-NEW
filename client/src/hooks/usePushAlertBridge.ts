import { useEffect } from "react";
import { markPushAlerted } from "../lib/dispatchAlerts";
import { showIncidentNotification } from "../lib/showIncidentNotification";

interface AlertNavAlertMessage {
  type?: string;
  title?: string;
  body?: string;
  url?: string;
}

function incidentIdFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url, window.location.origin).searchParams.get("incident");
  } catch {
    return null;
  }
}

/**
 * Foreground bridge for Progressier push messages.
 * OS banner is owned by Progressier's SW (background). When a /desk tab is
 * visible, Progressier may skip showNotification — then we banner once here.
 * Never banner again on top of Progressier's background display.
 */
export function usePushAlertBridge(): void {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      const data = event.data as AlertNavAlertMessage | null;
      if (data?.type !== "tow-not-alert") return;

      const incidentId = incidentIdFromUrl(data.url);
      if (incidentId) markPushAlerted(incidentId);

      if (document.visibilityState === "visible") {
        showIncidentNotification({
          id: incidentId ?? undefined,
          title: data.title || "AlertNav",
          body: data.body || "",
        });
      }
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);
}

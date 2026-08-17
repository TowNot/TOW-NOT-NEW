import { useEffect } from "react";
import { claimIncidentAlert } from "../lib/dispatchAlerts";
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
 * Foreground handler for Progressier push messages. Always banners and
 * sounds — a focused /desk tab must not swallow the alert.
 */
export function usePushAlertBridge(play: () => void): void {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      const data = event.data as AlertNavAlertMessage | null;
      if (data?.type !== "tow-not-alert") return;

      const incidentId = incidentIdFromUrl(data.url);
      showIncidentNotification({
        id: incidentId ?? undefined,
        title: data.title || "AlertNav",
        body: data.body || "",
      });

      if (!incidentId) {
        play();
        return;
      }
      if (claimIncidentAlert(incidentId)) play();
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [play]);
}

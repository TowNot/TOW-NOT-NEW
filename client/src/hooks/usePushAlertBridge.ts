import { useEffect } from "react";
import { claimIncidentAlert, markPushAlerted } from "../lib/dispatchAlerts";

interface TowNotAlertMessage {
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
 * Sounds the dispatch siren for pushes that arrive while the app is open.
 *
 * With the app in the foreground the operator should hear the TOW-NOT siren,
 * not just the platform chime, so the push claims the incident and plays it —
 * which also cancels the queued feed tone, keeping it to one siren per
 * incident. When the app is backgrounded the incident is only recorded: audio
 * cannot play there, and the system notification is the alert.
 */
export function usePushAlertBridge(play: () => void): void {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      const data = event.data as TowNotAlertMessage | null;
      if (data?.type !== "tow-not-alert") return;

      const incidentId = incidentIdFromUrl(data.url);
      const visible = typeof document !== "undefined" && document.visibilityState === "visible";

      if (!incidentId) {
        if (visible) play();
        return;
      }

      if (!visible) {
        markPushAlerted(incidentId);
        return;
      }
      if (claimIncidentAlert(incidentId)) play();
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [play]);
}

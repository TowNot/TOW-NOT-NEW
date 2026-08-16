import { useEffect } from "react";
import { markPushAlerted } from "../lib/dispatchAlerts";

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
 * Suppresses the in-app tone for incidents the device has already announced.
 *
 * The push notification itself makes the platform's sound, and on iOS that
 * banner sounds even with the app in the foreground. Playing the dispatch tone
 * as well is the double-sound operators were hearing, so a push claims the
 * incident and the live feed stays quiet for it.
 */
export function usePushAlertBridge(): void {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      const data = event.data as TowNotAlertMessage | null;
      if (data?.type !== "tow-not-alert") return;

      const incidentId = incidentIdFromUrl(data.url);
      if (incidentId) markPushAlerted(incidentId);
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);
}

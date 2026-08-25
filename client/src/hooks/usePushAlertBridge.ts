import { useEffect } from "react";
import { markPushAlerted } from "../lib/dispatchAlerts";

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
 * Foreground handler for Progressier push messages.
 * The service worker already called showNotification — do NOT fire another
 * Notification here (that was the double-banner race). Only mark the incident
 * so SSE/in-app tones do not stack on top of the push.
 */
export function usePushAlertBridge(): void {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      const data = event.data as AlertNavAlertMessage | null;
      if (data?.type !== "tow-not-alert") return;

      const incidentId = incidentIdFromUrl(data.url);
      if (incidentId) markPushAlerted(incidentId);
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);
}

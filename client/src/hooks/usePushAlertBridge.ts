import { useEffect } from "react";
import { markPushAlerted } from "../lib/dispatchAlerts";
import {
  passesDeskFilters,
  readDeskFilterPreferences,
} from "../lib/deskFilterPreferences";
import { getIncidentById } from "../lib/incidentRegistry";
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
 * Skips banners when desk filter toggles block the incident category.
 */
export function usePushAlertBridge(): void {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      const data = event.data as AlertNavAlertMessage | null;
      if (data?.type !== "tow-not-alert") return;

      const incidentId = incidentIdFromUrl(data.url);
      if (incidentId) markPushAlerted(incidentId);

      const incident = incidentId ? getIncidentById(incidentId) : undefined;
      const prefs = readDeskFilterPreferences();
      if (incident && !passesDeskFilters(incident, prefs)) return;

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

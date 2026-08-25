import { useEffect, useRef } from "react";
import { showIncidentNotification } from "../lib/showIncidentNotification";
import type { Incident } from "../types";

async function hasActivePushSubscription(): Promise<boolean> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;
  if (typeof Notification !== "undefined" && Notification.permission !== "granted") {
    return false;
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return Boolean(subscription);
  } catch {
    return false;
  }
}

/**
 * In-app / OS banner for new SSE incidents.
 * Skipped when Progressier push is active — the service worker already banners,
 * and a second `new Notification()` would duplicate.
 */
export function useAlertOnNewIncidents(incidents: Incident[]): void {
  const seen = useRef<Set<string>>(new Set());
  const primed = useRef(false);

  useEffect(() => {
    if (!primed.current) {
      incidents.forEach((incident) => seen.current.add(incident.id));
      primed.current = incidents.length > 0;
      return;
    }

    const newcomers = incidents.filter((incident) => !seen.current.has(incident.id));
    newcomers.forEach((incident) => seen.current.add(incident.id));
    if (newcomers.length === 0) return;

    void hasActivePushSubscription().then((pushActive) => {
      if (pushActive) return;
      for (const incident of newcomers) {
        showIncidentNotification({
          id: incident.id,
          title: incident.title,
          body: incident.locationLabel,
        });
      }
    });
  }, [incidents]);
}

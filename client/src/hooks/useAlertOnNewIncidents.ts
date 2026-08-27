import { useEffect, useRef } from "react";
import {
  passesDeskFilters,
  readDeskFilterPreferences,
  type DeskFilterPreferences,
} from "../lib/deskFilterPreferences";
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
 * In-app / OS banner for new SSE incidents when Progressier push is inactive.
 * Respects persisted desk filter toggles (sources + Accidents/Incidents).
 */
export function useAlertOnNewIncidents(
  incidents: Incident[],
  preferences: DeskFilterPreferences,
): void {
  const seen = useRef<Set<string>>(new Set());
  const primed = useRef(false);
  const prefsRef = useRef(preferences);
  prefsRef.current = preferences;

  useEffect(() => {
    if (!primed.current) {
      incidents.forEach((incident) => seen.current.add(incident.id));
      primed.current = incidents.length > 0;
      return;
    }

    const prefs = prefsRef.current;
    const newcomers = incidents.filter(
      (incident) =>
        !seen.current.has(incident.id) && passesDeskFilters(incident, prefs),
    );
    newcomers.forEach((incident) => seen.current.add(incident.id));
    if (newcomers.length === 0) return;

    void hasActivePushSubscription().then((pushActive) => {
      if (pushActive) return;
      const livePrefs = readDeskFilterPreferences();
      for (const incident of newcomers) {
        if (!passesDeskFilters(incident, livePrefs)) continue;
        showIncidentNotification({
          id: incident.id,
          title: incident.title,
          body: incident.locationLabel,
        });
      }
    });
  }, [incidents, preferences]);
}

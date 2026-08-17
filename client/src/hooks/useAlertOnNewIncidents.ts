import { useEffect, useRef } from "react";
import { scheduleIncidentAlert } from "../lib/dispatchAlerts";
import { showIncidentNotification } from "../lib/showIncidentNotification";
import type { Incident } from "../types";

export function useAlertOnNewIncidents(
  incidents: Incident[],
  play: () => void,
  enabled: boolean,
): void {
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

    for (const incident of newcomers) {
      showIncidentNotification({
        id: incident.id,
        title: incident.title,
        body: incident.locationLabel,
      });
      if (!enabled) continue;
      if (incident.source !== "fire_dispatch" && incident.source !== "waze") continue;
      scheduleIncidentAlert(incident.id, play);
    }
  }, [incidents, play, enabled]);
}

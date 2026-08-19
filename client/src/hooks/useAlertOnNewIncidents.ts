import { useEffect, useRef } from "react";
import { showIncidentNotification } from "../lib/showIncidentNotification";
import type { Incident } from "../types";

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

    for (const incident of newcomers) {
      showIncidentNotification({
        id: incident.id,
        title: incident.title,
        body: incident.locationLabel,
      });
    }
  }, [incidents]);
}

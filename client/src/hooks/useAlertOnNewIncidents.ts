import { useEffect, useRef } from "react";
import { scheduleIncidentAlert } from "../lib/dispatchAlerts";
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
    if (!enabled) return;

    for (const incident of newcomers) {
      const worthAlerting =
        incident.source === "fire_dispatch" ||
        incident.severity === "high" ||
        incident.severity === "critical";
      // Scheduled rather than played: a push for the same incident cancels it,
      // so the operator hears the device notification or the in-app tone, but
      // never both.
      if (worthAlerting) scheduleIncidentAlert(incident.id, play);
    }
  }, [incidents, play, enabled]);
}

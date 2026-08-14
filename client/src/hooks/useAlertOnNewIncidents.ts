import { useEffect, useRef } from "react";
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

    const shouldAlert = newcomers.some(
      (incident) =>
        incident.source === "fire_dispatch" ||
        incident.severity === "high" ||
        incident.severity === "critical",
    );

    if (enabled && shouldAlert) play();
  }, [incidents, play, enabled]);
}

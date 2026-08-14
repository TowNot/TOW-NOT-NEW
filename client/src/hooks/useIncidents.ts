import { useEffect, useRef, useState } from "react";
import type { HealthStatus, Incident } from "../types";

interface IncidentState {
  incidents: Incident[];
  connected: boolean;
  health: HealthStatus | null;
}

export function useIncidents(): IncidentState {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [connected, setConnected] = useState(false);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSnapshot(): Promise<void> {
      try {
        const response = await fetch("/api/incidents");
        if (!response.ok) throw new Error("Failed to load incidents");
        const body = (await response.json()) as { incidents: Incident[] };
        if (!cancelled) setIncidents(body.incidents);
      } catch {
        if (!cancelled) setConnected(false);
      }
    }

    void loadSnapshot();

    const source = new EventSource("/api/incidents/stream");
    sourceRef.current = source;

    source.addEventListener("snapshot", (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as Incident[];
      setIncidents(payload);
      setConnected(true);
    });

    source.addEventListener("upsert", (event) => {
      const incident = JSON.parse((event as MessageEvent).data) as Incident;
      setIncidents((current) => {
        const next = current.filter((item) => item.id !== incident.id);
        next.unshift(incident);
        return next.sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        );
      });
    });

    source.addEventListener("expire", (event) => {
      const incident = JSON.parse((event as MessageEvent).data) as Incident;
      setIncidents((current) => current.filter((item) => item.id !== incident.id));
    });

    source.onerror = () => {
      setConnected(false);
    };

    const healthTimer = window.setInterval(async () => {
      try {
        const response = await fetch("/api/health");
        if (!response.ok) throw new Error("health failed");
        const body = (await response.json()) as HealthStatus;
        if (!cancelled) setHealth(body);
      } catch {
        if (!cancelled) setHealth(null);
      }
    }, 10_000);
    void fetch("/api/health")
      .then((response) => response.json())
      .then((body: HealthStatus) => {
        if (!cancelled) setHealth(body);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      source.close();
      window.clearInterval(healthTimer);
    };
  }, []);

  return { incidents, connected, health };
}

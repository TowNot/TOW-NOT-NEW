import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, ensureDeviceSession, incidentStreamUrl } from "../lib/apiFetch";
import { isIncidentVisibleOnDesk } from "../lib/incidentAge";
import type { HealthStatus, Incident } from "../types";

interface IncidentState {
  incidents: Incident[];
  connected: boolean;
  health: HealthStatus | null;
}

const AGE_TICK_MS = 60_000;

function incidentSortMs(incident: Incident): number {
  const ms = Date.parse(incident.timestamp);
  return Number.isFinite(ms) ? ms : 0;
}

function sortIncidentsDesc(incidents: Incident[]): Incident[] {
  return [...incidents].sort((a, b) => incidentSortMs(b) - incidentSortMs(a));
}

export function useIncidents(): IncidentState {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [connected, setConnected] = useState(false);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  /** Re-render every minute so the 3h age gate advances without waiting for SSE. */
  const [nowMs, setNowMs] = useState(() => Date.now());
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSnapshot(): Promise<void> {
      try {
        await ensureDeviceSession();
        if (cancelled) return;

        const response = await apiFetch("/api/incidents");
        if (response.status === 401 || response.status === 403) {
          if (!cancelled) setConnected(false);
          return;
        }
        if (!response.ok) throw new Error("Failed to load incidents");
        const body = (await response.json()) as { incidents: Incident[] };
        if (!cancelled) setIncidents(sortIncidentsDesc(body.incidents));
      } catch {
        if (!cancelled) setConnected(false);
      }
    }

    void loadSnapshot();

    void ensureDeviceSession().then(() => {
      if (cancelled) return;

      const source = new EventSource(incidentStreamUrl());
      sourceRef.current = source;

      source.addEventListener("snapshot", (event) => {
        const payload = JSON.parse((event as MessageEvent).data) as Incident[];
        setIncidents(sortIncidentsDesc(payload));
        setConnected(true);
      });

      source.addEventListener("upsert", (event) => {
        const incident = JSON.parse((event as MessageEvent).data) as Incident;
        setIncidents((current) =>
          sortIncidentsDesc(current.filter((item) => item.id !== incident.id).concat(incident)),
        );
      });

      source.addEventListener("expire", (event) => {
        const incident = JSON.parse((event as MessageEvent).data) as Incident;
        setIncidents((current) => current.filter((item) => item.id !== incident.id));
      });

      source.onerror = () => {
        setConnected(false);
      };
    });

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

    const ageTimer = window.setInterval(() => {
      if (!cancelled) setNowMs(Date.now());
    }, AGE_TICK_MS);

    void fetch("/api/health")
      .then((response) => response.json())
      .then((body: HealthStatus) => {
        if (!cancelled) setHealth(body);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      sourceRef.current?.close();
      sourceRef.current = null;
      window.clearInterval(healthTimer);
      window.clearInterval(ageTimer);
    };
  }, []);

  const visibleIncidents = useMemo(
    () => incidents.filter((incident) => isIncidentVisibleOnDesk(incident, nowMs)),
    [incidents, nowMs],
  );

  return { incidents: visibleIncidents, connected, health };
}

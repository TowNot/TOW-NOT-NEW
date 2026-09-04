import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, ensureDeviceSession, incidentStreamUrl, SessionReplacedError } from "../lib/apiFetch";
import { isIncidentVisibleOnDesk } from "../lib/incidentAge";
import {
  isSessionTakenOver,
  SESSION_TAKEN_OVER_EVENT,
  subscribeSessionTakeover,
} from "../lib/sessionTakeover";
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
  const [paused, setPaused] = useState(() => isSessionTakenOver());
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    return subscribeSessionTakeover(() => {
      setPaused(isSessionTakenOver());
    });
  }, []);

  useEffect(() => {
    if (paused) {
      sourceRef.current?.close();
      sourceRef.current = null;
      setConnected(false);
      setIncidents([]);
      return;
    }

    let cancelled = false;

    async function loadSnapshot(): Promise<void> {
      try {
        await ensureDeviceSession();
        if (cancelled || isSessionTakenOver()) return;

        const response = await apiFetch("/api/incidents");
        if (response.status === 401 || response.status === 403) {
          if (!cancelled) {
            setConnected(false);
            setIncidents([]);
          }
          if (response.status === 403 && !cancelled) {
            window.location.replace("/get-started");
          }
          return;
        }
        if (!response.ok) throw new Error("Failed to load incidents");
        const body = (await response.json()) as { incidents: Incident[] };
        if (!cancelled && !isSessionTakenOver()) {
          setIncidents(sortIncidentsDesc(body.incidents));
        }
      } catch (error) {
        if (error instanceof SessionReplacedError) {
          setConnected(false);
          setIncidents([]);
          return;
        }
        if (!cancelled) setConnected(false);
      }
    }

    void loadSnapshot();

    void ensureDeviceSession().then(() => {
      if (cancelled || isSessionTakenOver()) return;

      const source = new EventSource(incidentStreamUrl());
      sourceRef.current = source;

      source.addEventListener("snapshot", (event) => {
        if (isSessionTakenOver()) return;
        const payload = JSON.parse((event as MessageEvent).data) as Incident[];
        setIncidents(sortIncidentsDesc(payload));
        setConnected(true);
      });

      source.addEventListener("upsert", (event) => {
        if (isSessionTakenOver()) return;
        const incident = JSON.parse((event as MessageEvent).data) as Incident;
        setIncidents((current) =>
          sortIncidentsDesc(current.filter((item) => item.id !== incident.id).concat(incident)),
        );
      });

      source.addEventListener("expire", (event) => {
        if (isSessionTakenOver()) return;
        const incident = JSON.parse((event as MessageEvent).data) as Incident;
        setIncidents((current) => current.filter((item) => item.id !== incident.id));
      });

      source.onerror = () => {
        setConnected(false);
        // EventSource cannot read 409 body; periodic verify / next apiFetch will lock out.
        if (isSessionTakenOver()) {
          source.close();
          sourceRef.current = null;
        }
      };
    });

    const healthTimer = window.setInterval(async () => {
      if (isSessionTakenOver()) return;
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
      if (!cancelled && !isSessionTakenOver()) setNowMs(Date.now());
    }, AGE_TICK_MS);

    void fetch("/api/health")
      .then((response) => response.json())
      .then((body: HealthStatus) => {
        if (!cancelled) setHealth(body);
      })
      .catch(() => undefined);

    const onTakenOver = () => {
      sourceRef.current?.close();
      sourceRef.current = null;
      setConnected(false);
      setIncidents([]);
    };
    window.addEventListener(SESSION_TAKEN_OVER_EVENT, onTakenOver);

    return () => {
      cancelled = true;
      sourceRef.current?.close();
      sourceRef.current = null;
      window.clearInterval(healthTimer);
      window.clearInterval(ageTimer);
      window.removeEventListener(SESSION_TAKEN_OVER_EVENT, onTakenOver);
    };
  }, [paused]);

  const visibleIncidents = useMemo(
    () => (paused ? [] : incidents.filter((incident) => isIncidentVisibleOnDesk(incident, nowMs))),
    [incidents, nowMs, paused],
  );

  return { incidents: visibleIncidents, connected: paused ? false : connected, health };
}

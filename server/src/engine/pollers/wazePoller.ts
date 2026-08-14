import { config } from "../../config";
import { logger } from "../../logger";
import { IncidentStore } from "../../store/incidentStore";
import type { Incident, IncidentSeverity } from "../../types/incident";
import { jitter, LONDON_ON_LOCATIONS } from "../londonLocations";
import { stableId } from "../../util/ids";

export interface WazeAlert {
  uuid: string;
  type: "ACCIDENT" | "HAZARD" | "ROAD_CLOSED";
  subtype: string;
  street: string;
  city: "London, ON";
  location: { x: number; y: number };
  reliability: number;
  pubMillis: number;
}

const ACCIDENT_POOL: Array<{ type: WazeAlert["type"]; subtype: string; title: string; severity: IncidentSeverity }> = [
  { type: "ACCIDENT", subtype: "ACCIDENT_MAJOR", title: "Major collision", severity: "critical" },
  { type: "ACCIDENT", subtype: "ACCIDENT_MINOR", title: "Minor collision", severity: "high" },
  { type: "HAZARD", subtype: "HAZARD_ON_ROAD_CAR_STOPPED", title: "Stopped vehicle", severity: "medium" },
  { type: "ROAD_CLOSED", subtype: "ROAD_CLOSED_EVENT", title: "Road closure", severity: "high" },
  { type: "ACCIDENT", subtype: "ACCIDENT_MAJOR", title: "Multi-vehicle accident", severity: "critical" },
];

const MAX_ACTIVE = 8;

export function scrapeWazeAccidents(): WazeAlert[] {
  const count = 2 + Math.floor(Math.random() * 4);
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => {
    const location = LONDON_ON_LOCATIONS[(now + i) % LONDON_ON_LOCATIONS.length];
    const template = ACCIDENT_POOL[i % ACCIDENT_POOL.length];
    const key = `${template.subtype}:${location.label}`;
    return {
      uuid: stableId("waze-raw", key),
      type: template.type,
      subtype: template.subtype,
      street: location.label,
      city: "London, ON",
      location: { x: jitter(location.longitude), y: jitter(location.latitude) },
      reliability: 6 + Math.floor(Math.random() * 4),
      pubMillis: now - i * 90_000,
    };
  });
}

export function mapWazeAlert(alert: WazeAlert): Incident {
  const template = ACCIDENT_POOL.find((item) => item.subtype === alert.subtype) ?? ACCIDENT_POOL[0];
  const timestamp = new Date(alert.pubMillis).toISOString();
  return {
    id: stableId("waze", alert.uuid),
    source: "waze",
    type: alert.type.toLowerCase(),
    title: template.title,
    description: `${template.title} reported on ${alert.street}. Reliability ${alert.reliability}/10.`,
    coordinates: { latitude: alert.location.y, longitude: alert.location.x },
    locationLabel: `${alert.street}, ${alert.city}`,
    severity: template.severity,
    timestamp,
    expiresAt: new Date(alert.pubMillis + config.incidentTtlMs).toISOString(),
  };
}

export class WazeTrafficPoller {
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly store: IncidentStore) {}

  start(): void {
    if (this.timer) return;
    logger.info("Waze traffic poller started", { intervalMs: config.pollIntervalMs });
    void this.poll();
    this.timer = setInterval(() => void this.poll(), config.pollIntervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async poll(): Promise<Incident[]> {
    const alerts = scrapeWazeAccidents();
    const incidents = alerts.slice(0, MAX_ACTIVE).map(mapWazeAlert);
    for (const incident of incidents) {
      this.store.upsert(incident);
    }
    logger.debug("Waze poll complete", { ingested: incidents.length });
    return incidents;
  }
}

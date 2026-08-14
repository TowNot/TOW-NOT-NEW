import { config } from "../../config";
import { logger } from "../../logger";
import { IncidentStore } from "../../store/incidentStore";
import type { Incident, IncidentSeverity } from "../../types/incident";
import { jitter, pickLocation } from "../londonLocations";
import { stableId } from "../../util/ids";

export interface GoogleMapsIncident {
  id: string;
  incidentType: "ACCIDENT" | "CONSTRUCTION" | "TRAFFIC_JAM" | "DISABLED_VEHICLE";
  severity: "MINOR" | "MODERATE" | "MAJOR" | "SEVERE";
  description: string;
  geolocation: { lat: number; lng: number };
  startTime: string;
}

const TYPE_POOL: Array<{
  incidentType: GoogleMapsIncident["incidentType"];
  severity: GoogleMapsIncident["severity"];
  mapped: IncidentSeverity;
  title: string;
}> = [
  { incidentType: "ACCIDENT", severity: "MAJOR", mapped: "high", title: "Traffic accident" },
  { incidentType: "TRAFFIC_JAM", severity: "MODERATE", mapped: "medium", title: "Heavy congestion" },
  { incidentType: "CONSTRUCTION", severity: "MINOR", mapped: "low", title: "Construction delay" },
  { incidentType: "DISABLED_VEHICLE", severity: "MODERATE", mapped: "medium", title: "Disabled vehicle" },
  { incidentType: "ACCIDENT", severity: "SEVERE", mapped: "critical", title: "Blocking collision" },
  { incidentType: "TRAFFIC_JAM", severity: "MAJOR", mapped: "high", title: "Standstill traffic" },
];

const MAX_ACTIVE = 8;

export function scrapeGoogleMapsIncidents(): GoogleMapsIncident[] {
  const count = 2 + Math.floor(Math.random() * 4);
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => {
    const location = pickLocation(Math.floor(now / 1000) + i * 3);
    const template = TYPE_POOL[i % TYPE_POOL.length];
    const key = `${template.incidentType}:${location.label}`;
    return {
      id: stableId("gmaps-raw", key),
      incidentType: template.incidentType,
      severity: template.severity,
      description: `${template.title} near ${location.label}`,
      geolocation: { lat: jitter(location.latitude), lng: jitter(location.longitude) },
      startTime: new Date(now - i * 120_000).toISOString(),
    };
  });
}

export function mapGoogleIncident(raw: GoogleMapsIncident): Incident {
  const template = TYPE_POOL.find((item) => item.incidentType === raw.incidentType && item.severity === raw.severity)
    ?? TYPE_POOL[0];
  const start = new Date(raw.startTime).getTime();
  return {
    id: stableId("google_maps", raw.id),
    source: "google_maps",
    type: raw.incidentType.toLowerCase(),
    title: template.title,
    description: raw.description,
    coordinates: { latitude: raw.geolocation.lat, longitude: raw.geolocation.lng },
    locationLabel: `${raw.description.replace(`${template.title} near `, "")}, London, ON`,
    severity: template.mapped,
    timestamp: raw.startTime,
    expiresAt: new Date(start + config.incidentTtlMs).toISOString(),
  };
}

export class GoogleMapsTrafficPoller {
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly store: IncidentStore) {}

  start(): void {
    if (this.timer) return;
    logger.info("Google Maps traffic poller started", { intervalMs: config.pollIntervalMs });
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
    const raw = scrapeGoogleMapsIncidents();
    const incidents = raw.slice(0, MAX_ACTIVE).map(mapGoogleIncident);
    for (const incident of incidents) {
      this.store.upsert(incident);
    }
    logger.debug("Google Maps poll complete", { ingested: incidents.length });
    return incidents;
  }
}

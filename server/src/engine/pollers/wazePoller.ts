import { config } from "../../config";
import { logger } from "../../logger";
import { IncidentStore } from "../../store/incidentStore";
import type { Incident, IncidentSeverity, IncidentSource } from "../../types/incident";
import { distanceKm } from "../geo";
import { probeCavsnHealth } from "./cavsnFetcher";
import {
  fetchLiveWazeProviders,
  GOOGLE_MAPS_DEDUP_RADIUS_KM,
  isBreakdown,
  isNotifiableCrash,
  LIVE_WAZE_PROVIDERS,
  type LiveWazeProvider,
  type ProviderSource,
  type WazeAlert,
} from "../wazeAggregator";

export type { WazeAlert };

function toSource(provider: ProviderSource): IncidentSource {
  return provider === "google_maps" ? "google_maps" : "waze";
}

function toSeverity(alert: WazeAlert): IncidentSeverity {
  if (isBreakdown(alert.type, alert.subtype)) return "high";
  const subtype = (alert.subtype ?? "").toUpperCase();
  if (subtype.includes("MAJOR") || subtype.includes("SEVERE") || subtype.includes("PILE")) {
    return "critical";
  }
  if (alert.type.toUpperCase().startsWith("ACCIDENT") || alert.type.toUpperCase().includes("CRASH")) {
    return "high";
  }
  return "medium";
}

function toTitle(alert: WazeAlert): string {
  if (isBreakdown(alert.type, alert.subtype)) return "Disabled vehicle";
  const subtype = (alert.subtype ?? "").toUpperCase();
  if (subtype.includes("MAJOR") || subtype.includes("PILE")) return "Major collision";
  if (alert.type.toUpperCase().startsWith("ACCIDENT")) return "Traffic accident";
  return alert.street ? `${alert.type} on ${alert.street}` : alert.type;
}

export function mapWazeAlert(alert: WazeAlert): Incident {
  const reported = alert.reportedAt.getTime();
  const street = alert.street?.trim() || "Unknown street";
  const city = alert.city?.trim() || "London, ON";
  return {
    id: `waze:${alert.alertId}`,
    source: toSource(alert.provider),
    type: alert.type,
    subtype: alert.subtype,
    title: toTitle(alert),
    description:
      alert.description?.trim() ||
      `${toTitle(alert)} reported on ${street}.`,
    coordinates: { latitude: alert.lat, longitude: alert.lng },
    locationLabel: `${street}, ${city}`,
    severity: toSeverity(alert),
    timestamp: alert.reportedAt.toISOString(),
    expiresAt: new Date(reported + config.incidentTtlMs).toISOString(),
    provider: alert.provider,
  };
}

export class WazeTrafficPoller {
  private timer: NodeJS.Timeout | null = null;
  private inFlight = false;

  constructor(private readonly store: IncidentStore) {}

  start(): void {
    if (this.timer) return;
    logger.info("Live traffic aggregator started", {
      intervalMs: config.pollIntervalMs,
      lat: config.londonLat,
      lng: config.londonLng,
      radiusKm: config.pollRadiusKm,
      providers: LIVE_WAZE_PROVIDERS.filter(
        (p) => (p === "blocksinside" && config.wazeApiKey) || (p === "cavsn" && config.rapidApiKey),
      ),
      wazeApiConfigured: Boolean(config.wazeApiKey),
      rapidApiConfigured: Boolean(config.rapidApiKey),
      cavsnHost: "waze-api-waze-scraper.p.rapidapi.com",
    });
    if (config.rapidApiKey) void probeCavsnHealth();
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
    const providers: LiveWazeProvider[] = [];
    if (config.wazeApiKey) providers.push("blocksinside");
    if (config.rapidApiKey) providers.push("cavsn");
    if (providers.length === 0) {
      logger.warn("Skipping live traffic poll; WAZEAPI_KEY and RAPIDAPI_KEY are both unset");
      return [];
    }
    if (this.inFlight) {
      logger.debug("Live traffic poll skipped: previous pass still running");
      return [];
    }
    this.inFlight = true;
    try {
      const alerts = await fetchLiveWazeProviders(
        config.londonLat,
        config.londonLng,
        config.pollRadiusKm,
        providers,
      );
      const ingested: Incident[] = [];
      for (const alert of alerts) {
        if (alert.provider === "google_maps" && this.hasNearbyCrash(alert)) {
          logger.info("Skipped drifting Google Maps pin near an active crash", {
            street: alert.street,
            provider: alert.provider,
          });
          continue;
        }
        const incident = mapWazeAlert(alert);
        this.store.upsert(incident);
        ingested.push(incident);
      }
      logger.debug(
        `Live traffic poll complete fetched=${alerts.length} ingested=${ingested.length}`,
      );
      return ingested;
    } catch (error) {
      logger.error("Live traffic poll failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    } finally {
      this.inFlight = false;
    }
  }

  private hasNearbyCrash(alert: WazeAlert): boolean {
    return this.store.getActive().some(
      (incident) =>
        isNotifiableCrash(incident.type, incident.subtype ?? null) &&
        distanceKm(
          incident.coordinates.latitude,
          incident.coordinates.longitude,
          alert.lat,
          alert.lng,
        ) <= GOOGLE_MAPS_DEDUP_RADIUS_KM,
    );
  }
}

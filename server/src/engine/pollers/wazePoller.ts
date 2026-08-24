import { config } from "../../config";
import { logger } from "../../logger";
import { IncidentStore } from "../../store/incidentStore";
import type { Incident, IncidentSeverity, IncidentSource } from "../../types/incident";
import { enabledCoverageZones } from "../coverageZones";
import {
  findNearbyMergeableIncident,
  isMergeableTrafficIncident,
  mergeIntoExistingIncident,
  withSourceDetections,
} from "../incidentMerge";
import {
  fetchLiveWazeProviders,
  isBreakdown,
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
    const enabled = enabledCoverageZones();
    logger.info("Live traffic aggregator started", {
      intervalMs: config.pollIntervalMs,
      providers: LIVE_WAZE_PROVIDERS.filter((p) => p === "blocksinside" && config.wazeApiKey),
      wazeApiConfigured: Boolean(config.wazeApiKey),
      filter: '["ACCIDENT"]',
      country: config.wazeApiCountry,
      tiles: 4,
      cities: enabled.map((zone) => zone.id),
    });
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
    if (providers.length === 0) {
      logger.warn("Skipping live traffic poll; WAZEAPI_KEY is unset");
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
        const incident = mapWazeAlert(alert);
        if (isMergeableTrafficIncident(incident)) {
          const nearby = findNearbyMergeableIncident(this.store, incident);
          if (nearby) {
            const merged = this.store.upsert(
              mergeIntoExistingIncident(nearby, withSourceDetections(incident)),
            );
            ingested.push(merged);
            logger.debug("Waze alert merged into nearby active incident", {
              incomingId: incident.id,
              mergedIntoId: nearby.id,
              sources: merged.sourceDetections?.map((detection) => detection.source),
            });
            continue;
          }
        }

        const created = this.store.upsert(
          isMergeableTrafficIncident(incident)
            ? withSourceDetections(incident)
            : incident,
        );
        ingested.push(created);
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
}

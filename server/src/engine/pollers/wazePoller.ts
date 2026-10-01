import { config } from "../../config";
import { claimIncidentIngest } from "../incidentIngestDedup";
import { logger } from "../../logger";
import { IncidentStore } from "../../store/incidentStore";
import type { Incident, IncidentSeverity, IncidentSource } from "../../types/incident";
import { getMonitoredCoverageZones } from "../coverageZones";
import {
  findNearbyMergeableIncident,
  isMergeableTrafficIncident,
  mergeIntoExistingIncident,
  withSourceDetections,
} from "../incidentMerge";
import {
  fetchBlocksInsideForZone,
  fetchOpenWebNinjaWazeForZone,
  isBreakdown,
  isPoliceType,
  type ProviderSource,
  type WazeAlert,
} from "../wazeAggregator";
import {
  startMonitoredZoneScheduler,
  ZONE_SCHEDULER_STAGGER_MS,
  type ZoneSchedulerHandle,
} from "./monitoredZoneScheduler";
import { noteDemandPollResult } from "../cityDemandSummary";

export type { WazeAlert };

function toSource(provider: ProviderSource): IncidentSource {
  return provider === "google_maps" ? "google_maps" : "waze";
}

function toSeverity(alert: WazeAlert): IncidentSeverity {
  if (isPoliceType(alert.type, alert.subtype)) return "medium";
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
  if (isPoliceType(alert.type, alert.subtype)) return "Police";
  if (isBreakdown(alert.type, alert.subtype)) return "Disabled vehicle";
  const subtype = (alert.subtype ?? "").toUpperCase();
  if (subtype.includes("MAJOR") || subtype.includes("PILE")) return "Major collision";
  if (alert.type.toUpperCase().startsWith("ACCIDENT")) return "Traffic accident";
  return alert.street ? `${alert.type} on ${alert.street}` : alert.type;
}

function toDescription(alert: WazeAlert, street: string): string {
  const note = alert.description?.trim();
  const by = alert.reporterName?.trim();
  if (isPoliceType(alert.type, alert.subtype)) {
    const subtype = alert.subtype?.trim();
    const parts = [note, subtype && subtype.toUpperCase() !== "POLICE" ? subtype : null].filter(
      Boolean,
    ) as string[];
    const base =
      parts.length > 0 ? parts.join(" · ") : `Police reported on ${street}.`;
    return by ? `${base}${base.endsWith(".") ? "" : "."} Reported by ${by}.` : base;
  }
  const base = note || `${toTitle(alert)} reported on ${street}.`;
  return by ? `${base}${base.endsWith(".") ? "" : "."} Reported by ${by}.` : base;
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
    description: toDescription(alert, street),
    coordinates: { latitude: alert.lat, longitude: alert.lng },
    locationLabel: `${street}, ${city}`,
    severity: toSeverity(alert),
    timestamp: alert.reportedAt.toISOString(),
    expiresAt: new Date(reported + config.incidentTtlMs).toISOString(),
    provider: alert.provider,
    ...(alert.reporterName ? { reporterName: alert.reporterName } : {}),
  };
}

/** Waze 1 = BlocksInside, Waze 2 = OpenWebNinja Waze. Identical settings, independent feeds. */
export type WazeFeed = "waze1" | "waze2";

interface WazeFeedSettings {
  /** Scheduler label — also routes `[city-demand]` counters. */
  label: string;
  demandKey: "waze" | "waze_2";
  enabled: () => boolean;
  pausedMessage: string;
  fetchZone: (zone: { id: string; name: string }) => Promise<WazeAlert[]>;
}

const WAZE_FEEDS: Record<WazeFeed, WazeFeedSettings> = {
  waze1: {
    label: "Waze 1 (BlocksInside)",
    demandKey: "waze",
    enabled: () => config.wazePollingEnabled && Boolean(config.wazeApiKey),
    pausedMessage: !config.wazePollingEnabled
      ? "[WAZE 1] BlocksInside paused — WAZE_POLLING_ENABLED=0 (Google Maps still running)"
      : "[WAZE 1] BlocksInside skipped — WAZEAPI_KEY is unset",
    fetchZone: fetchBlocksInsideForZone,
  },
  waze2: {
    label: "Waze 2 (OpenWebNinja)",
    demandKey: "waze_2",
    enabled: () => Boolean(config.openWebNinjaWazeApiKey),
    pausedMessage:
      "[WAZE 2] OpenWebNinja Waze off — set OPENWEBNINJA_WAZE_API_KEY in Railway to turn it on",
    fetchZone: fetchOpenWebNinjaWazeForZone,
  },
};

export class WazeTrafficPoller {
  private scheduler: ZoneSchedulerHandle | null = null;
  private readonly feed: WazeFeedSettings;

  constructor(
    private readonly store: IncidentStore,
    feed: WazeFeed = "waze1",
  ) {
    this.feed = WAZE_FEEDS[feed];
  }

  start(): void {
    if (this.scheduler) return;
    if (!this.feed.enabled()) {
      logger.info(this.feed.pausedMessage);
      return;
    }
    logger.info(`[${this.feed.label}] live traffic poller started`, {
      intervalMs: config.pollIntervalMs,
      staggerMs: ZONE_SCHEDULER_STAGGER_MS,
      prismaDemandedCities: true,
      filter: '["ACCIDENT","POLICE"]',
      tiles: 12,
      ...(this.feed.demandKey === "waze" ? { country: config.wazeApiCountry } : {}),
    });
    this.scheduler = startMonitoredZoneScheduler({
      label: this.feed.label,
      intervalMs: config.pollIntervalMs,
      resolveZones: getMonitoredCoverageZones,
      run: async (zone) => {
        await this.pollZone(zone);
      },
    });
  }

  stop(): void {
    this.scheduler?.stop();
    this.scheduler = null;
  }

  async pollZone(zone: { id: string; name: string }): Promise<Incident[]> {
    if (!this.feed.enabled()) return [];
    try {
      const alerts = await this.feed.fetchZone(zone);
      const ingested = await this.ingestAlerts(alerts);
      noteDemandPollResult(this.feed.demandKey, zone.id, true);
      return ingested;
    } catch (error) {
      noteDemandPollResult(this.feed.demandKey, zone.id, false);
      logger.error(`${this.feed.label} poll failed`, {
        zone: zone.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  private async ingestAlerts(alerts: WazeAlert[]): Promise<Incident[]> {
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

      if (!this.store.getById(incident.id)) {
        const claimed = await claimIncidentIngest(incident.id);
        if (!claimed) {
          logger.debug("Skipping Waze ingest — cluster dedup lock held", {
            incidentId: incident.id,
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
    if (alerts.length > 0 || ingested.length > 0) {
      logger.info(
        `${this.feed.label} poll complete fetched=${alerts.length} ingested=${ingested.length}`,
      );
    }
    return ingested;
  }
}

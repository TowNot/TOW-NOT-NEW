import { config } from "../../config";
import { claimIncidentIngest } from "../incidentIngestDedup";
import { logger } from "../../logger";
import { IncidentStore } from "../../store/incidentStore";
import type { Incident } from "../../types/incident";
import {
  findNearbyMergeableIncident,
  isMergeableTrafficIncident,
  shouldPushOnGenericMerge,
  withSourceDetections,
} from "../incidentMerge";
import {
  fetchOpenWebNinjaGoogleMapsForCity,
  getMonitoredGoogleMapsCities,
  GOOGLE_MAPS_ZOOM_LEVELS,
  type GoogleMapsCity,
} from "../googleMaps/openWebNinjaGoogleMapsScraper";
import {
  isGoogleMapsClusterUpgrade,
  mergeGoogleMapsIntoCluster,
} from "../googleMaps/clusterUpgrade";
import { logGoogleMapsNotificationGate } from "../googleMaps/googleMapsNotificationGate";
import {
  startMonitoredZoneScheduler,
  ZONE_SCHEDULER_STAGGER_MS,
  type ZoneSchedulerHandle,
} from "./monitoredZoneScheduler";
import { noteDemandPollResult } from "../cityDemandSummary";

/** Extreme field-test cadence (15s). Waze uses config.pollIntervalMs (10s). */
const GOOGLE_MAPS_POLL_INTERVAL_MS = 15_000;

interface IngestStats {
  pushed: number;
  merged: number;
}

/**
 * Standalone OpenWebNinja Google Maps poller.
 * One independent timer per configured city; does not import BlocksInside / Fire paths.
 */
export class GoogleMapsTrafficPoller {
  private scheduler: ZoneSchedulerHandle | null = null;

  constructor(private readonly store: IncidentStore) {}

  start(): void {
    if (this.scheduler) return;
    if (!config.openWebNinjaApiKey) {
      logger.warn(
        "OPENWEBNINJA_API_KEY unset — OpenWebNinja Google Maps poller will not start",
      );
      return;
    }
    logger.info("[GOOGLE MAPS] starting OpenWebNinja city poller", {
      intervalMs: GOOGLE_MAPS_POLL_INTERVAL_MS,
      staggerMs: ZONE_SCHEDULER_STAGGER_MS,
      prismaDemandedCities: true,
      zooms: GOOGLE_MAPS_ZOOM_LEVELS.join("-"),
      tilesPerCity: "4 @ Z11–14; dynamic @ Z15",
      fetchConcurrency: 8,
      endpoint: "https://api.openwebninja.com/google-maps-traffic-alerts/traffic-alerts",
    });
    this.scheduler = startMonitoredZoneScheduler({
      label: "OpenWebNinja Google Maps",
      intervalMs: GOOGLE_MAPS_POLL_INTERVAL_MS,
      resolveZones: getMonitoredGoogleMapsCities,
      run: async (city) => {
        await this.pollCity(city);
      },
    });
  }

  stop(): void {
    this.scheduler?.stop();
    this.scheduler = null;
  }

  async pollCity(city: GoogleMapsCity): Promise<Incident[]> {
    if (!config.openWebNinjaApiKey) return [];
    const started = Date.now();
    try {
      const fetchResult = await fetchOpenWebNinjaGoogleMapsForCity(city);
      const { incidents, stats } = await this.ingestIncidents(fetchResult.incidents);
      noteDemandPollResult("google_maps", city.id, true);
      logger.debug(
        `[GoogleMaps Poll] city=${city.id} | tiles=${fetchResult.tiles} | fetched=${fetchResult.fetched} | retained=${fetchResult.retained} | pushed=${stats.pushed} | merged=${stats.merged} | duration=${fetchResult.latencyMs || Date.now() - started}ms`,
      );
      return incidents;
    } catch (error) {
      noteDemandPollResult("google_maps", city.id, false);
      logger.error("OpenWebNinja Google Maps poll failed", {
        city: city.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  private async ingestIncidents(incidents: Incident[]): Promise<{
    incidents: Incident[];
    stats: IngestStats;
  }> {
    const ingested: Incident[] = [];
    let pushed = 0;
    let merged = 0;

    for (const incident of incidents) {
      if (!isMergeableTrafficIncident(incident)) {
        if (!this.store.getById(incident.id)) {
          const claimed = await claimIncidentIngest(incident.id);
          if (!claimed) {
            logger.debug("Skipping Google Maps ingest — cluster dedup lock held", {
              incidentId: incident.id,
            });
            continue;
          }
        }
        const existed = this.store.getById(incident.id);
        this.store.upsert(incident);
        ingested.push(incident);
        if (!existed) pushed += 1;
        continue;
      }

      const nearby = findNearbyMergeableIncident(this.store, incident);
      if (nearby) {
        const cluster = mergeGoogleMapsIntoCluster(nearby, incident);
        const upserted = this.store.upsert(cluster);
        ingested.push(upserted);
        merged += 1;
        if (isGoogleMapsClusterUpgrade(nearby, incident, upserted)) {
          pushed += 1;
          this.store.emitClusterUpgrade({
            previous: nearby,
            incoming: incident,
            merged: upserted,
          });
        } else if (shouldPushOnGenericMerge(nearby, incident)) {
          pushed += 1;
          this.store.emitClusterMergePush({
            existing: nearby,
            incoming: incident,
            merged: upserted,
          });
        } else {
          logGoogleMapsNotificationGate(
            incident.id,
            "MERGED WITHOUT PUSH (Existing cluster)",
            `cluster=${nearby.id} | rawType=${incident.rawType ?? "unknown"}`,
          );
        }
        logger.debug("OpenWebNinja Google Maps merged into nearby active incident", {
          incomingId: incident.id,
          mergedIntoId: nearby.id,
          sources: upserted.sourceDetections?.map((detection) => detection.source),
        });
        continue;
      }

      if (!this.store.getById(incident.id)) {
        const claimed = await claimIncidentIngest(incident.id);
        if (!claimed) {
          logger.debug("Skipping Google Maps ingest — cluster dedup lock held", {
            incidentId: incident.id,
          });
          continue;
        }
      }

      const existed = this.store.getById(incident.id);
      const created = this.store.upsert(withSourceDetections(incident));
      ingested.push(created);
      if (existed) {
        logGoogleMapsNotificationGate(
          incident.id,
          "SKIPPED PUSH (Existing ID refresh)",
          `rawType=${incident.rawType ?? "unknown"}`,
        );
      } else {
        pushed += 1;
      }
    }

    logger.debug("OpenWebNinja Google Maps ingest complete", {
      fetched: incidents.length,
      ingested: ingested.length,
      pushed,
      merged,
    });
    return { incidents: ingested, stats: { pushed, merged } };
  }
}

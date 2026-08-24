import { config } from "../../config";
import { logger } from "../../logger";
import { IncidentStore } from "../../store/incidentStore";
import type { Incident } from "../../types/incident";
import {
  findNearbyMergeableIncident,
  isMergeableTrafficIncident,
  withSourceDetections,
} from "../incidentMerge";
import {
  countGoogleMapsFetchJobs,
  fetchOpenWebNinjaGoogleMapsForCity,
  GOOGLE_MAPS_CITIES,
  GOOGLE_MAPS_ZOOM_LEVELS,
  type GoogleMapsCity,
} from "../googleMaps/openWebNinjaGoogleMapsScraper";
import {
  isGoogleMapsClusterUpgrade,
  mergeGoogleMapsIntoCluster,
} from "../googleMaps/clusterUpgrade";
import { logGoogleMapsNotificationGate } from "../googleMaps/googleMapsNotificationGate";
import {
  startStaggeredZoneSchedulers,
  ZONE_SCHEDULER_STAGGER_MS,
  type ZoneSchedulerHandle,
} from "./staggeredZoneScheduler";

/** Extreme field-test cadence (15s). Waze uses config.pollIntervalMs (10s). */
const GOOGLE_MAPS_POLL_INTERVAL_MS = 15_000;

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
      independentZoneTimers: true,
      zooms: GOOGLE_MAPS_ZOOM_LEVELS.join("-"),
      tilesPerCity: "4 @ Z11–14; dynamic @ Z15",
      requestsPerPoll: GOOGLE_MAPS_CITIES.reduce(
        (total, city) => total + countGoogleMapsFetchJobs(city.box!),
        0,
      ),
      fetchConcurrency: 8,
      cities: GOOGLE_MAPS_CITIES.map((c) => c.id),
      endpoint: "https://api.openwebninja.com/google-maps-traffic-alerts/traffic-alerts",
    });
    this.scheduler = startStaggeredZoneSchedulers({
      label: "OpenWebNinja Google Maps",
      zones: GOOGLE_MAPS_CITIES,
      intervalMs: GOOGLE_MAPS_POLL_INTERVAL_MS,
      zoneId: (city) => city.id,
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
    try {
      const incidents = await fetchOpenWebNinjaGoogleMapsForCity(city);
      return this.ingestIncidents(incidents);
    } catch (error) {
      logger.error("OpenWebNinja Google Maps poll failed", {
        city: city.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  private ingestIncidents(incidents: Incident[]): Incident[] {
    const ingested: Incident[] = [];
    for (const incident of incidents) {
      if (!isMergeableTrafficIncident(incident)) {
        this.store.upsert(incident);
        ingested.push(incident);
        continue;
      }

      const nearby = findNearbyMergeableIncident(this.store, incident);
      if (nearby) {
        const merged = this.store.upsert(mergeGoogleMapsIntoCluster(nearby, incident));
        ingested.push(merged);
        if (isGoogleMapsClusterUpgrade(nearby, incident, merged)) {
          this.store.emitClusterUpgrade({
            previous: nearby,
            incoming: incident,
            merged,
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
          sources: merged.sourceDetections?.map((detection) => detection.source),
        });
        continue;
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
      }
    }
    logger.debug("OpenWebNinja Google Maps ingest complete", {
      fetched: incidents.length,
      ingested: ingested.length,
    });
    return ingested;
  }
}

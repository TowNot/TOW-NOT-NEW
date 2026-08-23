import { config } from "../../config";
import { logger } from "../../logger";
import { IncidentStore } from "../../store/incidentStore";
import type { Incident } from "../../types/incident";
import { distanceKm } from "../geo";
import {
  fetchAllOpenWebNinjaGoogleMapsCities,
  GOOGLE_MAPS_CITIES,
} from "../googleMaps/openWebNinjaGoogleMapsScraper";

/** Match nearby store rows so zoom wobble does not create a second SSE event. */
const STORE_DEDUP_RADIUS_KM = 0.075;

/** OpenWebNinja field-test cadence (30s). Waze uses config.pollIntervalMs (10s). */
const GOOGLE_MAPS_POLL_INTERVAL_MS = 30_000;

/**
 * Standalone OpenWebNinja Google Maps poller.
 * Does not import or call BlocksInside / Fire code paths.
 */
export class GoogleMapsTrafficPoller {
  private timer: NodeJS.Timeout | null = null;
  private inFlight = false;

  constructor(private readonly store: IncidentStore) {}

  start(): void {
    if (this.timer) return;
    if (!config.openWebNinjaApiKey) {
      logger.warn(
        "OPENWEBNINJA_API_KEY unset — OpenWebNinja Google Maps poller will not start",
      );
      return;
    }
    logger.info("[GOOGLE MAPS] starting OpenWebNinja city poller", {
      intervalMs: GOOGLE_MAPS_POLL_INTERVAL_MS,
      zooms: "11-14",
      tilesPerCity: 4,
      cities: GOOGLE_MAPS_CITIES.map((c) => c.id),
      endpoint: "https://api.openwebninja.com/google-maps-traffic-alerts/traffic-alerts",
    });
    void this.poll();
    this.timer = setInterval(() => void this.poll(), GOOGLE_MAPS_POLL_INTERVAL_MS);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async poll(): Promise<Incident[]> {
    if (!config.openWebNinjaApiKey) return [];
    if (this.inFlight) {
      logger.debug("OpenWebNinja Google Maps poll skipped: previous pass still running");
      return [];
    }
    this.inFlight = true;
    try {
      const incidents = await fetchAllOpenWebNinjaGoogleMapsCities();
      const ingested: Incident[] = [];
      for (const incident of incidents) {
        if (this.hasNearbyDuplicate(incident)) {
          logger.debug("OpenWebNinja Google Maps skipped near-duplicate already in store", {
            id: incident.id,
            type: incident.type,
          });
          continue;
        }
        this.store.upsert(incident);
        ingested.push(incident);
      }
      logger.debug("OpenWebNinja Google Maps ingest complete", {
        fetched: incidents.length,
        ingested: ingested.length,
      });
      return ingested;
    } catch (error) {
      logger.error("OpenWebNinja Google Maps poll failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    } finally {
      this.inFlight = false;
    }
  }

  private hasNearbyDuplicate(incoming: Incident): boolean {
    // Exact id already handled by store upsert — this catches spatial wobble
    // with a different minted id across polls.
    return this.store.getActive().some((existing) => {
      if (existing.id === incoming.id) return false;
      if (existing.source !== "google_maps") return false;
      if (existing.type !== incoming.type) return false;
      return (
        distanceKm(
          existing.coordinates.latitude,
          existing.coordinates.longitude,
          incoming.coordinates.latitude,
          incoming.coordinates.longitude,
        ) <= STORE_DEDUP_RADIUS_KM
      );
    });
  }
}

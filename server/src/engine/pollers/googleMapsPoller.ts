import { config } from "../../config";
import { logger } from "../../logger";
import { IncidentStore } from "../../store/incidentStore";
import type { Incident } from "../../types/incident";
import { distanceKm } from "../geo";
import {
  fetchAllOpenWebNinjaGoogleMapsCities,
  GOOGLE_MAPS_CITIES,
  GOOGLE_MAPS_PUSH_DEDUP_RADIUS_KM,
} from "../googleMaps/openWebNinjaGoogleMapsScraper";

/** Extreme field-test cadence (15s). Waze uses config.pollIntervalMs (10s). */
const GOOGLE_MAPS_POLL_INTERVAL_MS = 15_000;

function isGoogleMapsAccident(incident: Incident): boolean {
  return (
    incident.source === "google_maps" &&
    incident.type.toUpperCase().startsWith("ACCIDENT")
  );
}

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
      zooms: "10-16",
      tilesPerCity: 4,
      requestsPerPoll: 28,
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
        if (!isGoogleMapsAccident(incident)) {
          this.store.upsert(incident);
          ingested.push(incident);
          continue;
        }

        const nearby = this.findNearbyAccident(incident);
        if (nearby) {
          const merged = this.store.upsert({
            ...incident,
            id: nearby.id,
            source: nearby.source,
            timestamp: nearby.timestamp,
            notified: nearby.notified,
            googleMapsZoom: nearby.googleMapsZoom ?? incident.googleMapsZoom,
          });
          ingested.push(merged);
          logger.debug("OpenWebNinja Google Maps merged into nearby active accident", {
            incomingId: incident.id,
            mergedIntoId: nearby.id,
            radiusKm: GOOGLE_MAPS_PUSH_DEDUP_RADIUS_KM,
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

  private findNearbyAccident(incoming: Incident): Incident | undefined {
    return this.store.getActive().find((existing) => {
      if (existing.id === incoming.id) return false;
      if (!existing.type.toUpperCase().startsWith("ACCIDENT")) return false;
      return (
        distanceKm(
          existing.coordinates.latitude,
          existing.coordinates.longitude,
          incoming.coordinates.latitude,
          incoming.coordinates.longitude,
        ) <= GOOGLE_MAPS_PUSH_DEDUP_RADIUS_KM
      );
    });
  }
}

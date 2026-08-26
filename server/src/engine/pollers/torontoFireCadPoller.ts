import { config } from "../../config";
import { logger } from "../../logger";
import type { IncidentStore } from "../../store/incidentStore";
import type { Incident } from "../../types/incident";
import {
  findNearbyMergeableIncident,
  isMergeableTrafficIncident,
  mergeIntoExistingIncident,
  withSourceDetections,
} from "../incidentMerge";
import {
  fetchTorontoFireCadEvents,
  type TorontoFireCadEvent,
} from "../torontoFire/liveCadClient";
import { isTorontoFireVehicleCollision } from "../torontoFire/vehicleIncidentFilter";
import {
  resolveTorontoFireCadZoneId,
  type TorontoFireCadZoneId,
} from "../torontoFire/zoneAssign";
import { getCoverageZone } from "../zones.config";

export const TORONTO_FIRE_CAD_PROVIDER = "toronto_fire_cad";
export const TORONTO_FIRE_CAD_INTERVAL_MS = 60_000;

export function torontoFireCadProviderForZone(zoneId: string): string {
  return `${zoneId}_${TORONTO_FIRE_CAD_PROVIDER}`;
}

export function isTorontoFireCadProvider(provider?: string | null): boolean {
  if (!provider) return false;
  return (
    provider === TORONTO_FIRE_CAD_PROVIDER || provider.endsWith(`_${TORONTO_FIRE_CAD_PROVIDER}`)
  );
}

export function zoneIdFromTorontoFireCadProvider(provider?: string | null): string | null {
  if (!provider) return null;
  const m = provider.match(/^([a-zA-Z]+)_toronto_fire_cad$/);
  return m?.[1] ?? null;
}

function buildLocationQuery(event: TorontoFireCadEvent): string | null {
  const prime = event.primeStreet.replace(/\s+/g, " ").trim();
  const cross = event.crossStreets.replace(/\s+/g, " ").replace(/^\s*\/\s*$/, "").trim();
  // FSA-only primes (e.g. "M5R") are not geocodable intersections.
  const primeIsFsa = /^[A-Z]\d[A-Z]$/i.test(prime);
  if (prime && !primeIsFsa && cross && !/^\/?$/.test(cross)) {
    return `${prime} & ${cross}, Toronto, Ontario, Canada`;
  }
  if (prime && !primeIsFsa) return `${prime}, Toronto, Ontario, Canada`;
  if (cross && cross.includes("/")) {
    const parts = cross.split("/").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]} & ${parts[1]}, Toronto, Ontario, Canada`;
    }
  }
  return null;
}

async function geocodeToronto(query: string): Promise<{ lat: number; lng: number } | null> {
  const q = encodeURIComponent(query);
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=ca`,
    {
      headers: { "User-Agent": "AlertNav-TorontoFireCad/1.0" },
      signal: AbortSignal.timeout(8_000),
    },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ lat?: string; lon?: string }>;
  const hit = rows[0];
  if (!hit?.lat || !hit.lon) return null;
  const lat = Number(hit.lat);
  const lng = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function zoneCenterCoords(zoneId: TorontoFireCadZoneId): { lat: number; lng: number } {
  const zone = getCoverageZone(zoneId);
  if (!zone) return { lat: 43.6532, lng: -79.3832 };
  return {
    lat: (zone.bounds.southWest.lat + zone.bounds.northEast.lat) / 2,
    lng: (zone.bounds.southWest.lng + zone.bounds.northEast.lng) / 2,
  };
}

function parseDispatchTimeMs(raw: string): number | null {
  // CAD uses "2026-08-26T01:17:31" without Z — treat as America/Toronto local is hard
  // without a tz lib; append Z is wrong. Prefer Date.parse as local server time, else now.
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

function locationLabel(event: TorontoFireCadEvent, zoneId: TorontoFireCadZoneId): string {
  const zoneName = getCoverageZone(zoneId)?.name ?? "Toronto";
  const prime = event.primeStreet.replace(/\s+/g, " ").trim();
  const cross = event.crossStreets.replace(/\s+/g, " ").replace(/^\s*\/\s*$/, "").trim();
  const primeIsFsa = /^[A-Z]\d[A-Z]$/i.test(prime);
  if (prime && !primeIsFsa && cross && cross.includes("/")) {
    return `${prime} / ${cross}, ${zoneName}, ON`;
  }
  if (prime && !primeIsFsa) return `${prime}, ${zoneName}, ON`;
  if (cross && cross.includes("/")) return `${cross}, ${zoneName}, ON`;
  return `${zoneName}, ON`;
}

/**
 * Background poller for Toronto Fire live CAD vehicle collisions.
 * Uses setInterval(...).unref() so it never holds the process open alone
 * and does not block Waze / Google Maps / fire-audio / SSE.
 */
export class TorontoFireCadPoller {
  private timer: NodeJS.Timeout | null = null;
  private inFlight = false;
  /** First successful fetch is silent (avoid cold-start push spam). */
  private bootstrapped = false;
  /** Incident numbers already pushed / upserted this process life. */
  private readonly seenEventNums = new Set<string>();

  constructor(private readonly store: IncidentStore) {}

  start(): void {
    if (this.timer) return;
    if (!config.torontoFireCadEnabled) {
      logger.info(
        "[Toronto Fire CAD] skipped — TORONTO_FIRE_CAD_ENABLED not set (London-only mode)",
      );
      return;
    }
    logger.info("[Toronto Fire CAD] starting active-incidents poller", {
      intervalMs: TORONTO_FIRE_CAD_INTERVAL_MS,
      endpoint: "https://www.toronto.ca/data/fire/livecad.xml",
      zones: ["torontoCore", "scarborough", "northYork", "etobicoke"],
      filter: "vehicle collision / personal injury only",
    });
    // Kick once soon after boot, then every 60s. unref = non-blocking.
    this.timer = setInterval(() => {
      void this.pollSafe();
    }, TORONTO_FIRE_CAD_INTERVAL_MS);
    this.timer.unref();
    setTimeout(() => void this.pollSafe(), 5_000).unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async pollSafe(): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      await this.poll();
    } catch (err) {
      logger.warn("[Toronto Fire CAD] poll failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.inFlight = false;
    }
  }

  private async poll(): Promise<void> {
    const events = await fetchTorontoFireCadEvents();
    const vehicle = events.filter((e) => isTorontoFireVehicleCollision(e.eventType));
    const silent = !this.bootstrapped;
    let created = 0;
    let skipped = 0;

    for (const event of vehicle) {
      const result = await this.ingestEvent(event, silent);
      if (result === "created") created += 1;
      else skipped += 1;
    }

    this.bootstrapped = true;
    logger.info("[Toronto Fire CAD] poll complete", {
      total: events.length,
      vehicle: vehicle.length,
      created,
      skipped,
      silentBootstrap: silent,
    });
  }

  private async ingestEvent(
    event: TorontoFireCadEvent,
    silent: boolean,
  ): Promise<"created" | "skipped"> {
    const id = `tfs:${event.eventNum}`;
    if (this.seenEventNums.has(event.eventNum) || this.store.getById(id)) {
      this.seenEventNums.add(event.eventNum);
      return "skipped";
    }

    const query = buildLocationQuery(event);
    let coords = query ? await geocodeToronto(query).catch(() => null) : null;
    const zoneId = resolveTorontoFireCadZoneId({
      primeStreet: event.primeStreet,
      beat: event.beat,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
    });
    if (!coords) coords = zoneCenterCoords(zoneId);

    const dispatchMs = parseDispatchTimeMs(event.dispatchTime);
    // First-seen clock for push age gate; CAD dispatch time stays in description.
    const now = Date.now();
    const incident: Incident = withSourceDetections({
      id,
      source: "google_maps",
      type: "ACCIDENT",
      subtype: "TORONTO_FIRE_VEHICLE",
      title: "Traffic accident",
      description:
        `${event.eventType}` +
        (event.dispatchTime ? ` · dispatched ${event.dispatchTime}` : "") +
        (event.units ? ` · units ${event.units}` : ""),
      coordinates: { latitude: coords.lat, longitude: coords.lng },
      locationLabel: locationLabel(event, zoneId),
      severity: /highway/i.test(event.eventType) ? "critical" : "high",
      timestamp: new Date(now).toISOString(),
      expiresAt: new Date(now + config.incidentTtlMs).toISOString(),
      provider: torontoFireCadProviderForZone(zoneId),
      rawType: event.eventType,
      unverifiedAddress: !query,
    });

    // Prefer merging into an existing Waze/GMaps crash nearby (same desk card).
    if (isMergeableTrafficIncident(incident)) {
      const nearby = findNearbyMergeableIncident(this.store, incident);
      if (nearby) {
        const merged = mergeIntoExistingIncident(nearby, incident);
        this.store.upsert(merged, { suppressPush: true });
        this.seenEventNums.add(event.eventNum);
        logger.debug("[Toronto Fire CAD] merged into existing incident", {
          eventNum: event.eventNum,
          into: nearby.id,
        });
        return "skipped";
      }
    }

    this.store.upsert(incident, { suppressPush: silent });
    this.seenEventNums.add(event.eventNum);
    logger.info("[Toronto Fire CAD] ingested vehicle collision", {
      eventNum: event.eventNum,
      zoneId,
      type: event.eventType,
      silent,
      dispatchMs,
    });
    return "created";
  }
}

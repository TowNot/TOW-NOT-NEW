import { config } from "../../config";
import { boundingBox, distanceKm, splitBoundingBox, type BoundingBox } from "../geo";
import {
  enabledCoverageZones,
  zoneCenter,
  zoneToBoundingBox,
} from "../coverageZones";
import { logger } from "../../logger";
import type { Incident, IncidentSeverity } from "../../types/incident";
import { mergeGoogleMapsRawType, mergeGoogleMapsZoom } from "./googleMapsDisplay";

const ENDPOINT = "https://api.openwebninja.com/google-maps-traffic-alerts/traffic-alerts";
const ZOOM_MIN = 11;
const ZOOM_MAX = 14;
/** 2×2 quadrants over the city box (same grid pattern as BlocksInside Waze). */
const GOOGLE_MAPS_TILE_DIVISIONS = 2;
/** Push + live-desk merge radius for Google Maps ACCIDENT rows (200 m). */
export const GOOGLE_MAPS_PUSH_DEDUP_RADIUS_KM = 0.2;
/** Cross-zoom pins often wobble slightly — treat within ~75 m as the same incident. */
const DEDUP_RADIUS_KM = 0.075;
const REQUEST_TIMEOUT_MS = 20_000;
/** Max parallel OpenWebNinja calls per poll (4 tiles × 4 zooms = 16 jobs, run in waves). */
const FETCH_CONCURRENCY = 6;

export interface GoogleMapsCity {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusKm: number;
  /** Optional fixed box (preferred over radius for London coverage). */
  box?: BoundingBox;
}

/** OpenWebNinja Google Maps is London-only, even if other zones are enabled. */
const GOOGLE_MAPS_ZONE_IDS = new Set(["london"]);

export const GOOGLE_MAPS_CITIES: GoogleMapsCity[] = enabledCoverageZones()
  .filter((zone) => GOOGLE_MAPS_ZONE_IDS.has(zone.id))
  .map((zone) => {
    const box = zoneToBoundingBox(zone);
    const center = zoneCenter(zone);
    return {
      id: zone.id,
      name: `${zone.name}, ON`,
      lat: center.lat,
      lng: center.lng,
      radiusKm: config.pollRadiusKm,
      box,
    };
  });

export interface OpenWebNinjaGoogleMapsRuntime {
  lastFetchAt: string | null;
  lastSuccessAt: string | null;
  lastStatus: number | null;
  lastLatencyMs: number | null;
  lastError: string | null;
  lastRawCount: number | null;
  lastDedupedCount: number | null;
  lastZoomsOk: number | null;
  lastTypeCounts: Record<string, number> | null;
  city: string;
}

const runtime: OpenWebNinjaGoogleMapsRuntime = {
  lastFetchAt: null,
  lastSuccessAt: null,
  lastStatus: null,
  lastLatencyMs: null,
  lastError: null,
  lastRawCount: null,
  lastDedupedCount: null,
  lastZoomsOk: null,
  lastTypeCounts: null,
  city: "london_on",
};

export function getOpenWebNinjaGoogleMapsRuntime(): OpenWebNinjaGoogleMapsRuntime {
  return { ...runtime };
}

interface RawAlert {
  type?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  lat?: unknown;
  lng?: unknown;
  id?: unknown;
  alert_id?: unknown;
  street?: unknown;
  road?: unknown;
  address?: unknown;
  location?: unknown;
  description?: unknown;
  title?: unknown;
  name?: unknown;
  cross_street?: unknown;
  crossStreet?: unknown;
}

interface TaggedRawAlert {
  raw: RawAlert;
  zoom: number;
}

/** Explicit crash/collision types → notifiable ACCIDENT. */
const ACCIDENT_TYPE_WHITELIST = new Set([
  "accident",
  "crash",
  "collision",
  "vehicle_collision",
  "vehicle collision",
  "car_crash",
  "car crash",
]);

/** Always drop — these are what caused Highbury-style noise. */
const HARD_DROP_TYPES = new Set([
  "construction",
  "road_closed",
  "roadclosed",
  "road_closure",
  "roadwork",
  "maintenance",
  "closure",
]);

/**
 * OpenWebNinja types:
 * - accident / crash / collision → real crashes
 * - incident / other → retained as ACCIDENT (subtype GOOGLE_MAPS_INCIDENT); HARD_DROP_TYPES
 *   still filter construction/closure noise.
 */
function classify(rawType: string): {
  type: string;
  subtype: string | null;
  title: string;
  severity: IncidentSeverity;
} | null {
  const key = rawType.toLowerCase().trim();
  if (!key || HARD_DROP_TYPES.has(key)) return null;

  if (ACCIDENT_TYPE_WHITELIST.has(key) || key === "incident" || key === "other") {
    return {
      type: "ACCIDENT",
      subtype:
        key === "incident" || key === "other" ? "GOOGLE_MAPS_INCIDENT" : null,
      title:
        key === "incident" || key === "other"
          ? "Traffic Incident / Collision"
          : "Traffic accident",
      severity: "high",
    };
  }

  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function boxParams(box: BoundingBox): { bottom_left: string; top_right: string } {
  return {
    bottom_left: `${box.bottomLeft.lat},${box.bottomLeft.lng}`,
    top_right: `${box.topRight.lat},${box.topRight.lng}`,
  };
}

function extractAlerts(payload: unknown): RawAlert[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const data = (root["data"] ?? root) as Record<string, unknown>;
  const alerts = data["alerts"];
  return Array.isArray(alerts) ? (alerts as RawAlert[]) : [];
}

/** Pull any street-like string OpenWebNinja may include beyond the OpenAPI schema. */
function extractStreetLabel(raw: RawAlert): string | null {
  const direct =
    asString(raw.street) ||
    asString(raw.road) ||
    asString(raw.address) ||
    asString(raw.cross_street) ||
    asString(raw.crossStreet) ||
    asString(raw.name) ||
    asString(raw.title);
  if (direct) return direct;

  if (raw.location && typeof raw.location === "object") {
    const loc = raw.location as Record<string, unknown>;
    const nested =
      asString(loc["street"]) ||
      asString(loc["road"]) ||
      asString(loc["address"]) ||
      asString(loc["name"]) ||
      asString(loc["label"]);
    if (nested) return nested;
  }

  const description = asString(raw.description);
  if (description && !/^incident$/i.test(description)) return description;

  return null;
}

function formatLocationLabel(
  raw: RawAlert,
  city: GoogleMapsCity,
  lat: number,
  lng: number,
  title: string,
): { locationLabel: string; description: string } {
  const street = extractStreetLabel(raw);
  const coords = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  if (street) {
    return {
      locationLabel: `${street}, ${city.name}`,
      description: `${title} reported on ${street}, ${city.name}.`,
    };
  }
  // API schema has no street — never show "Unknown street".
  return {
    locationLabel: `${city.name} · ${coords}`,
    description: `${title} reported in ${city.name} near ${coords}.`,
  };
}

function stableIncidentId(opts: {
  providerId: string | null;
  type: string;
  lat: number;
  lng: number;
}): string {
  if (opts.providerId) return `gmaps:${opts.providerId}`;
  // 4 decimal places ≈ 11 m — stable across zoom wobble.
  return `gmaps:${opts.type}:${opts.lat.toFixed(4)}:${opts.lng.toFixed(4)}`;
}

function toIncident(
  tagged: TaggedRawAlert,
  city: GoogleMapsCity,
  now: Date,
): Incident | null {
  const { raw, zoom } = tagged;
  const lat = asNumber(raw.latitude) ?? asNumber(raw.lat);
  const lng = asNumber(raw.longitude) ?? asNumber(raw.lng);
  if (lat == null || lng == null) return null;

  const rawType = asString(raw.type) ?? "";
  const mapped = classify(rawType);
  if (!mapped) return null;

  const providerId = asString(raw.id) ?? asString(raw.alert_id);
  const labels = formatLocationLabel(raw, city, lat, lng, mapped.title);
  const normalizedRawType = rawType.toLowerCase().trim() || undefined;

  return {
    id: stableIncidentId({
      providerId,
      type: mapped.type,
      lat,
      lng,
    }),
    source: "google_maps",
    type: mapped.type,
    subtype: mapped.subtype,
    title: mapped.title,
    description: asString(raw.description) || labels.description,
    coordinates: { latitude: lat, longitude: lng },
    locationLabel: labels.locationLabel,
    severity: mapped.severity,
    timestamp: now.toISOString(),
    expiresAt: new Date(now.getTime() + config.incidentTtlMs).toISOString(),
    provider: "openwebninja_google_maps",
    googleMapsZoom: zoom,
    rawType: normalizedRawType,
  };
}

/**
 * Deduplicate by provider id first, then by proximity+type across zoom levels.
 */
export function dedupeGoogleMapsIncidents(incidents: Incident[]): Incident[] {
  const byId = new Map<string, Incident>();
  for (const incident of incidents) {
    const existing = byId.get(incident.id);
    if (!existing) {
      byId.set(incident.id, incident);
      continue;
    }
    byId.set(incident.id, {
      ...existing,
      googleMapsZoom: mergeGoogleMapsZoom(existing.googleMapsZoom, incident.googleMapsZoom),
      rawType: mergeGoogleMapsRawType(existing.rawType, incident.rawType),
    });
  }

  const unique: Incident[] = [];
  for (const incident of byId.values()) {
    const duplicate = unique.find(
      (kept) =>
        kept.type === incident.type &&
        distanceKm(
          kept.coordinates.latitude,
          kept.coordinates.longitude,
          incident.coordinates.latitude,
          incident.coordinates.longitude,
        ) <= DEDUP_RADIUS_KM,
    );
    if (duplicate) {
      duplicate.googleMapsZoom = mergeGoogleMapsZoom(
        duplicate.googleMapsZoom,
        incident.googleMapsZoom,
      );
      duplicate.rawType = mergeGoogleMapsRawType(duplicate.rawType, incident.rawType);
      continue;
    }
    unique.push(incident);
  }
  return unique;
}

async function fetchZoom(
  box: BoundingBox,
  zoom: number,
  apiKey: string,
): Promise<TaggedRawAlert[]> {
  const params = new URLSearchParams({
    ...boxParams(box),
    zoom: String(zoom),
  });
  // Rollback (unfiltered): `${ENDPOINT}?${params.toString()}`
  // Rollback (incident filter): `${ENDPOINT}?${params.toString()}&alert_types=incident`
  const url = `${ENDPOINT}?${params.toString()}&alert_types=accident`;
  const res = await fetch(url, {
    headers: {
      "X-API-Key": apiKey,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  runtime.lastStatus = res.status;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`openwebninja google_maps zoom=${zoom} status=${res.status} body=${body.slice(0, 200)}`);
  }
  const json = (await res.json().catch(() => ({}))) as unknown;
  return extractAlerts(json).map((raw) => ({ raw, zoom }));
}

/** Run tile/zoom fetches in small parallel batches to avoid API timeouts. */
async function fetchJobsWithConcurrency(
  jobs: Array<{ tile: BoundingBox; zoom: number }>,
  apiKey: string,
): Promise<PromiseSettledResult<TaggedRawAlert[]>[]> {
  const settled: PromiseSettledResult<TaggedRawAlert[]>[] = [];
  for (let i = 0; i < jobs.length; i += FETCH_CONCURRENCY) {
    const batch = jobs.slice(i, i + FETCH_CONCURRENCY);
    const batchResults = await Promise.allSettled(
      batch.map(({ tile, zoom }) => fetchZoom(tile, zoom, apiKey)),
    );
    settled.push(...batchResults);
  }
  return settled;
}

/**
 * Poll OpenWebNinja Google Maps traffic alerts for one city: 2×2 tile grid,
 * zooms 11–14 per tile. Completely independent of BlocksInside / Fire pipelines.
 */
export async function fetchOpenWebNinjaGoogleMapsForCity(
  city: GoogleMapsCity,
): Promise<Incident[]> {
  const apiKey = config.openWebNinjaApiKey;
  if (!apiKey) {
    throw new Error("OPENWEBNINJA_API_KEY is not configured");
  }

  const box = city.box ?? boundingBox(city.lat, city.lng, city.radiusKm);
  const tiles = splitBoundingBox(box, GOOGLE_MAPS_TILE_DIVISIONS);
  const started = Date.now();
  runtime.lastFetchAt = new Date().toISOString();
  runtime.city = city.id;
  runtime.lastError = null;
  runtime.lastTypeCounts = null;

  const zoomLevels = Array.from(
    { length: ZOOM_MAX - ZOOM_MIN + 1 },
    (_, i) => ZOOM_MIN + i,
  );

  const fetchJobs = tiles.flatMap((tile) =>
    zoomLevels.map((zoom) => ({ tile, zoom })),
  );

  const settled = await fetchJobsWithConcurrency(fetchJobs, apiKey);

  const rawMerged: TaggedRawAlert[] = [];
  let zoomsOk = 0;
  const failureMessages: string[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") {
      zoomsOk += 1;
      rawMerged.push(...result.value);
    } else {
      const message =
        result.reason instanceof Error ? result.reason.message : String(result.reason);
      failureMessages.push(message);
    }
  }

  const zoomsFailed = failureMessages.length;
  if (zoomsFailed > 0) {
    logger.warn("OpenWebNinja Google Maps tile/zoom fetches failed", {
      city: city.id,
      failed: zoomsFailed,
      total: fetchJobs.length,
      sample: [...new Set(failureMessages)].slice(0, 2),
    });
  }

  runtime.lastLatencyMs = Date.now() - started;
  runtime.lastZoomsOk = zoomsOk;
  runtime.lastRawCount = rawMerged.length;

  if (zoomsOk === 0) {
    const message = "OpenWebNinja Google Maps: all tile/zoom fetches failed";
    runtime.lastError = message;
    throw new Error(message);
  }

  const now = new Date();
  const mapped: Incident[] = [];
  let dropped = 0;
  const typeCounts: Record<string, number> = {};
  for (const tagged of rawMerged) {
    const rawType = (asString(tagged.raw.type) ?? "unknown").toLowerCase();
    typeCounts[rawType] = (typeCounts[rawType] ?? 0) + 1;
    const incident = toIncident(tagged, city, now);
    if (incident) mapped.push(incident);
    else dropped += 1;
  }

  const deduped = dedupeGoogleMapsIncidents(mapped);
  runtime.lastDedupedCount = deduped.length;
  runtime.lastSuccessAt = now.toISOString();
  runtime.lastTypeCounts = typeCounts;

  logger.info("OpenWebNinja Google Maps poll complete", {
    city: city.id,
    tiles: tiles.length,
    zoomsOk,
    zoomsFailed,
    zoomsTotal: fetchJobs.length,
    fetchConcurrency: FETCH_CONCURRENCY,
    raw: rawMerged.length,
    retainedAccidents: mapped.length,
    droppedNonAccidents: dropped,
    deduped: deduped.length,
    typeCounts,
    latencyMs: runtime.lastLatencyMs,
  });

  return deduped;
}

export async function fetchAllOpenWebNinjaGoogleMapsCities(): Promise<Incident[]> {
  const batches = await Promise.allSettled(
    GOOGLE_MAPS_CITIES.map((city) => fetchOpenWebNinjaGoogleMapsForCity(city)),
  );
  const merged: Incident[] = [];
  for (const result of batches) {
    if (result.status === "fulfilled") merged.push(...result.value);
    else {
      logger.warn("OpenWebNinja Google Maps city poll failed", {
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  }
  return dedupeGoogleMapsIncidents(merged);
}

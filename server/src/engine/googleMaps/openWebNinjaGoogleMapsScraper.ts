import { config } from "../../config";
import { boundingBox, distanceKm, type BoundingBox } from "../geo";
import {
  enabledCoverageZones,
  zoneCenter,
  zoneToBoundingBox,
} from "../coverageZones";
import { logger } from "../../logger";
import type { Incident, IncidentSeverity } from "../../types/incident";

const ENDPOINT = "https://api.openwebninja.com/google-maps-traffic-alerts/traffic-alerts";
const ZOOM_MIN = 11;
const ZOOM_MAX = 16;
/** Cross-zoom pins often wobble slightly — treat within ~75 m as the same incident. */
const DEDUP_RADIUS_KM = 0.075;
const REQUEST_TIMEOUT_MS = 20_000;

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
 * OpenWebNinja types (per their docs):
 * - accident / crash / collision → real crashes (notify)
 * - incident → UNTRUSTED catch-all (Google often parks construction, delays,
 *   and unclassified pins here — Highbury ramp spam). Never notify.
 * - construction / road_closed → always drop
 */
function classify(rawType: string): {
  type: string;
  subtype: string | null;
  title: string;
  severity: IncidentSeverity;
} | null {
  const key = rawType.toLowerCase().trim();
  if (!key || HARD_DROP_TYPES.has(key)) return null;

  if (ACCIDENT_TYPE_WHITELIST.has(key)) {
    return {
      type: "ACCIDENT",
      subtype: null,
      title: "Traffic accident",
      severity: "high",
    };
  }

  // Do not promote generic "incident" — OpenWebNinja uses it for construction
  // and delays as often as for crashes (Highbury Ave S ramp).
  return null;
}

/**
 * Chronic Google Maps false-positive corridors in London (construction shown
 * as generic pins). Any OpenWebNinja pin inside these boxes is dropped.
 */
const GOOGLE_MAPS_DROP_ZONES: Array<{ name: string; box: BoundingBox }> = [
  {
    // Highbury Ave S ↔ Highway 401 interchange / south ramp construction
    name: "highbury_401",
    box: {
      bottomLeft: { lat: 42.972, lng: -81.228 },
      topRight: { lat: 43.008, lng: -81.182 },
    },
  },
];

function dropZoneFor(lat: number, lng: number): string | null {
  for (const zone of GOOGLE_MAPS_DROP_ZONES) {
    const { bottomLeft, topRight } = zone.box;
    if (
      lat >= bottomLeft.lat &&
      lat <= topRight.lat &&
      lng >= bottomLeft.lng &&
      lng <= topRight.lng
    ) {
      return zone.name;
    }
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
  raw: RawAlert,
  city: GoogleMapsCity,
  now: Date,
): Incident | null {
  const lat = asNumber(raw.latitude) ?? asNumber(raw.lat);
  const lng = asNumber(raw.longitude) ?? asNumber(raw.lng);
  if (lat == null || lng == null) return null;

  const zone = dropZoneFor(lat, lng);
  if (zone) {
    logger.debug("OpenWebNinja Google Maps dropped known construction corridor pin", {
      zone,
      lat,
      lng,
      rawType: asString(raw.type),
    });
    return null;
  }

  const rawType = asString(raw.type) ?? "";
  const mapped = classify(rawType);
  if (!mapped) return null;

  const providerId = asString(raw.id) ?? asString(raw.alert_id);
  const labels = formatLocationLabel(raw, city, lat, lng, mapped.title);

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
  };
}

/**
 * Deduplicate by provider id first, then by proximity+type across zoom levels.
 */
export function dedupeGoogleMapsIncidents(incidents: Incident[]): Incident[] {
  const byId = new Map<string, Incident>();
  for (const incident of incidents) {
    if (!byId.has(incident.id)) byId.set(incident.id, incident);
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
    if (duplicate) continue;
    unique.push(incident);
  }
  return unique;
}

async function fetchZoom(
  box: BoundingBox,
  zoom: number,
  apiKey: string,
): Promise<RawAlert[]> {
  const params = new URLSearchParams({
    ...boxParams(box),
    zoom: String(zoom),
  });
  const url = `${ENDPOINT}?${params.toString()}`;
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
  return extractAlerts(json);
}

/**
 * Poll OpenWebNinja Google Maps traffic alerts for one city across zooms 11–16.
 * Completely independent of BlocksInside / Fire pipelines.
 */
export async function fetchOpenWebNinjaGoogleMapsForCity(
  city: GoogleMapsCity,
): Promise<Incident[]> {
  const apiKey = config.openWebNinjaApiKey;
  if (!apiKey) {
    throw new Error("OPENWEBNINJA_API_KEY is not configured");
  }

  const box = city.box ?? boundingBox(city.lat, city.lng, city.radiusKm);
  const started = Date.now();
  runtime.lastFetchAt = new Date().toISOString();
  runtime.city = city.id;
  runtime.lastError = null;
  runtime.lastTypeCounts = null;

  const zoomLevels = Array.from(
    { length: ZOOM_MAX - ZOOM_MIN + 1 },
    (_, i) => ZOOM_MIN + i,
  );

  const settled = await Promise.allSettled(
    zoomLevels.map((zoom) => fetchZoom(box, zoom, apiKey)),
  );

  const rawMerged: RawAlert[] = [];
  let zoomsOk = 0;
  for (const result of settled) {
    if (result.status === "fulfilled") {
      zoomsOk += 1;
      rawMerged.push(...result.value);
    } else {
      logger.warn("OpenWebNinja Google Maps zoom fetch failed", {
        city: city.id,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  }

  runtime.lastLatencyMs = Date.now() - started;
  runtime.lastZoomsOk = zoomsOk;
  runtime.lastRawCount = rawMerged.length;

  if (zoomsOk === 0) {
    const message = "OpenWebNinja Google Maps: all zoom fetches failed";
    runtime.lastError = message;
    throw new Error(message);
  }

  const now = new Date();
  const mapped: Incident[] = [];
  let dropped = 0;
  const typeCounts: Record<string, number> = {};
  for (const raw of rawMerged) {
    const rawType = (asString(raw.type) ?? "unknown").toLowerCase();
    typeCounts[rawType] = (typeCounts[rawType] ?? 0) + 1;
    const incident = toIncident(raw, city, now);
    if (incident) mapped.push(incident);
    else dropped += 1;
  }

  const deduped = dedupeGoogleMapsIncidents(mapped);
  runtime.lastDedupedCount = deduped.length;
  runtime.lastSuccessAt = now.toISOString();
  runtime.lastTypeCounts = typeCounts;

  logger.info("OpenWebNinja Google Maps poll complete", {
    city: city.id,
    zoomsOk,
    zoomsTotal: zoomLevels.length,
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

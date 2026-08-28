import { config } from "../../config";
import { boundingBox, distanceKm, splitBoundingBox, type BoundingBox } from "../geo";
import {
  enabledCoverageZones,
  getMonitoredCoverageZones,
  zoneCenter,
  zoneToBoundingBox,
} from "../coverageZones";
import { logger } from "../../logger";
import type { Incident, IncidentSeverity } from "../../types/incident";
import { keepAliveFetch } from "../httpFetch";
import { extractReporterName } from "../reporterName";
import { mergeLane } from "../incidentMerge";
import {
  mergeGoogleMapsRawType,
  mergeGoogleMapsRawTypePreferUpgrade,
  mergeGoogleMapsZoom,
} from "./googleMapsDisplay";
import { logGoogleMapsNotificationGate } from "./googleMapsNotificationGate";

const ENDPOINT = "https://api.openwebninja.com/google-maps-traffic-alerts/traffic-alerts";
/** 2×2 quadrants over the city box at zooms 11–14 (same grid pattern as BlocksInside Waze). */
const GOOGLE_MAPS_TILE_DIVISIONS = 2;
/** OpenWebNinja max queryable tile area (km²) at zoom 15. */
const ZOOM_15_MAX_TILE_AREA_KM2 = 30;
const REQUEST_TIMEOUT_MS = 20_000;
/** Max parallel OpenWebNinja calls per poll (batched to avoid rate limits with Z15 tiles). */
const FETCH_CONCURRENCY = 8;
/** Push + live-desk merge radius for Google Maps ACCIDENT rows (200 m). */
export const GOOGLE_MAPS_PUSH_DEDUP_RADIUS_KM = 0.2;
/** Cross-zoom pins often wobble slightly — treat within ~75 m as the same incident. */
const DEDUP_RADIUS_KM = 0.075;

export const GOOGLE_MAPS_ZOOM_LEVELS = [11, 12, 13, 14, 15] as const;

function boundingBoxAreaKm2(box: BoundingBox): number {
  const heightKm = distanceKm(
    box.bottomLeft.lat,
    box.bottomLeft.lng,
    box.topRight.lat,
    box.bottomLeft.lng,
  );
  const widthKm = distanceKm(
    box.bottomLeft.lat,
    box.bottomLeft.lng,
    box.bottomLeft.lat,
    box.topRight.lng,
  );
  return heightKm * widthKm;
}

/** Z11–14 use 2×2; Z15 splits the box to stay under OpenWebNinja's 30 km² cap. */
function tileDivisionsForZoom(box: BoundingBox, zoom: number): number {
  if (zoom <= 14) return GOOGLE_MAPS_TILE_DIVISIONS;

  const fullAreaKm2 = boundingBoxAreaKm2(box);
  const minDivisions = Math.ceil(Math.sqrt(fullAreaKm2 / ZOOM_15_MAX_TILE_AREA_KM2));
  return Math.max(GOOGLE_MAPS_TILE_DIVISIONS, minDivisions);
}

export function countGoogleMapsFetchJobs(box: BoundingBox): number {
  return GOOGLE_MAPS_ZOOM_LEVELS.reduce((total, zoom) => {
    const divisions = tileDivisionsForZoom(box, zoom);
    return total + divisions * divisions;
  }, 0);
}

function buildGoogleMapsFetchJobs(box: BoundingBox): Array<{ tile: BoundingBox; zoom: number }> {
  return GOOGLE_MAPS_ZOOM_LEVELS.flatMap((zoom) => {
    const divisions = tileDivisionsForZoom(box, zoom);
    const tiles = splitBoundingBox(box, divisions);
    return tiles.map((tile) => ({ tile, zoom }));
  });
}

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

function coverageZoneToGoogleMapsCity(
  zone: ReturnType<typeof enabledCoverageZones>[number],
): GoogleMapsCity {
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
}

export const GOOGLE_MAPS_CITIES: GoogleMapsCity[] = enabledCoverageZones()
  .filter((zone) => GOOGLE_MAPS_ZONE_IDS.has(zone.id))
  .map(coverageZoneToGoogleMapsCity);

/** Cities selected by active users that OpenWebNinja supports. */
export async function getMonitoredGoogleMapsCities(): Promise<GoogleMapsCity[]> {
  const zones = await getMonitoredCoverageZones();
  return zones
    .filter((zone) => GOOGLE_MAPS_ZONE_IDS.has(zone.id))
    .map(coverageZoneToGoogleMapsCity);
}

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
  incidentId?: unknown;
  street?: unknown;
  road?: unknown;
  address?: unknown;
  location?: unknown;
  description?: unknown;
  title?: unknown;
  name?: unknown;
  cross_street?: unknown;
  crossStreet?: unknown;
  details?: unknown;
  snippet?: unknown;
  reported_by?: unknown;
  reportedBy?: unknown;
  reporter?: unknown;
  reporterName?: unknown;
  reporter_name?: unknown;
  username?: unknown;
  userName?: unknown;
  nickname?: unknown;
  author?: unknown;
  publisher?: unknown;
  sourceName?: unknown;
  source_name?: unknown;
  user?: unknown;
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

/** Generic incident/other rows whose text is closure/construction → road_hazard. */
function mapGenericClosureToRoadHazard(keyword: string): {
  type: string;
  subtype: string | null;
  title: string;
  severity: IncidentSeverity;
} {
  const lower = keyword.toLowerCase();
  const isConstruction = /construction|roadwork|road work|paving|maintenance/.test(lower);
  return {
    type: isConstruction ? "CONSTRUCTION" : "ROAD_CLOSED",
    subtype: "GOOGLE_MAPS_CLOSURE",
    title: isConstruction ? "Construction zone" : "Road closed",
    severity: "medium",
  };
}

function isGenericOpenWebNinjaType(rawType: string): boolean {
  const key = rawType.toLowerCase().trim();
  return key === "incident" || key === "other";
}

/** Crowd-sourced crash language — do not reclassify these as road_hazard. */
const CRASH_LANGUAGE_RE =
  /\b(accident|accidents|crash|crashed|collision|collisions|mvc|pileup|pile-up|struck|rollover|hit|stalled|disabled|vehicle)\b/i;

/** Promote generic incident/other rows to accident when crash language dominates. */
const CRASH_PROMOTION_RE =
  /\b(accident|accidents|crash|crashed|collision|collisions|mvc|pileup|pile-up|struck|rollover|hit)\b/i;

export function promoteRawTypeForCrashLanguage(
  rawType: string,
  alertText: string,
): string {
  if (!isGenericOpenWebNinjaType(rawType)) return rawType;
  if (CRASH_PROMOTION_RE.test(alertText)) return "accident";
  return rawType;
}

/**
 * Only reclassify generic incident/other rows when closure language dominates
 * and there is no crash language (accidents posted beside road closed must stay pushable).
 */
function shouldReclassifyGenericAsRoadHazard(rawType: string, alertText: string): boolean {
  if (!isGenericOpenWebNinjaType(rawType)) return false;
  if (!findExcludedKeyword(alertText)) return false;
  if (CRASH_LANGUAGE_RE.test(alertText)) return false;
  return true;
}

// ROLLBACK: remove EXCLUDED_KEYWORDS + findExcludedKeyword match below to disable filter.
const EXCLUDED_KEYWORDS = [
  "construction",
  "roadwork",
  "road work",
  "paving",
  "maintenance",
  "closure",
  "closed",
];

/**
 * True crashes / high-severity ACCIDENT rows must not be killed because the
 * payload mentions nearby construction (e.g. Wellington & Baseline).
 * Pure construction / closure *types* are already hard-dropped in classify().
 */
function shouldBypassConstructionKeywordFilter(
  rawType: string,
  mapped: { type: string; severity: IncidentSeverity },
): boolean {
  const key = rawType.toLowerCase().trim();
  if (ACCIDENT_TYPE_WHITELIST.has(key)) return true;
  if (mapped.type === "ACCIDENT" && (mapped.severity === "high" || mapped.severity === "critical")) {
    return true;
  }
  return false;
}

function collectRawAlertText(raw: RawAlert, mappedTitle: string, mappedDescription: string): string {
  const parts = [
    mappedTitle,
    mappedDescription,
    asString(raw.title),
    asString(raw.description),
    asString(raw.details),
    asString(raw.snippet),
    asString(raw.name),
    asString(raw.street),
    asString(raw.road),
    asString(raw.address),
    extractStreetLabel(raw),
  ];
  return parts.filter(Boolean).join(" ");
}

function findExcludedKeyword(text: string): string | null {
  const lower = text.toLowerCase();
  for (const keyword of EXCLUDED_KEYWORDS) {
    if (lower.includes(keyword)) return keyword;
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

/** Compact diagnostic for every OpenWebNinja row before filters run. Off unless GOOGLE_MAPS_VERBOSE_RAW_LOG=1. */
function logRawGoogleMapsItem(details: {
  rawId: string;
  incidentId: string;
  rawType: string;
  lat: number | string;
  lng: number | string;
  zoom: number;
  title: string;
  desc: string;
}): void {
  if (process.env.GOOGLE_MAPS_VERBOSE_RAW_LOG !== "1") return;
  logger.info(
    `[GoogleMaps Raw Item] rawId: ${details.rawId || "none"} | incidentId: ${details.incidentId} | rawType: ${details.rawType} | lat: ${details.lat}, lng: ${details.lng} | zoom: ${details.zoom} | title: "${details.title}" | desc: "${details.desc}"`,
  );
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
  const rawId =
    asString(raw.id) ?? asString(raw.incidentId) ?? asString(raw.alert_id) ?? "";
  const lat = asNumber(raw.latitude) ?? asNumber(raw.lat);
  const lng = asNumber(raw.longitude) ?? asNumber(raw.lng);
  const rawType = asString(raw.type) ?? "";

  if (lat == null || lng == null) {
    logRawGoogleMapsItem({
      rawId,
      incidentId: "n/a",
      rawType,
      lat: String(raw.latitude ?? raw.lat ?? ""),
      lng: String(raw.longitude ?? raw.lng ?? ""),
      zoom,
      title: asString(raw.title) ?? "",
      desc:
        asString(raw.description) ??
        asString(raw.snippet) ??
        asString(raw.details) ??
        "",
    });
    return null;
  }

  const preliminaryDescription =
    asString(raw.description) ?? asString(raw.snippet) ?? asString(raw.details) ?? "";
  const preliminaryTitle = asString(raw.title) ?? "";
  const alertTextForPromotion = collectRawAlertText(
    raw,
    preliminaryTitle,
    preliminaryDescription,
  );
  const effectiveRawType = promoteRawTypeForCrashLanguage(rawType, alertTextForPromotion);
  if (effectiveRawType !== rawType) {
    logger.info(
      `[GoogleMaps] Promoted generic ${rawType} → accident via crash language | title="${preliminaryTitle}"`,
    );
  }

  const mappedBase = classify(effectiveRawType);
  if (!mappedBase) {
    logRawGoogleMapsItem({
      rawId,
      incidentId: "n/a",
      rawType,
      lat,
      lng,
      zoom,
      title: asString(raw.title) ?? "",
      desc:
        asString(raw.description) ??
        asString(raw.snippet) ??
        asString(raw.details) ??
        "",
    });
    logGoogleMapsNotificationGate(
      rawId || `${lat.toFixed(5)},${lng.toFixed(5)}`,
      "DROPPED (Type filter)",
      `rawType=${effectiveRawType || rawType || "unknown"}`,
    );
    return null;
  }

  const alertText = collectRawAlertText(raw, mappedBase.title, preliminaryDescription);
  const closureKeyword = findExcludedKeyword(alertText);
  let mapped = mappedBase;

  // Generic incident/other + closure-only language → road_hazard (map only), not crash.
  if (shouldReclassifyGenericAsRoadHazard(effectiveRawType, alertText) && closureKeyword) {
    mapped = mapGenericClosureToRoadHazard(closureKeyword);
    logger.info(
      `[GoogleMaps] Reclassified generic ${effectiveRawType} as ${mapped.type} | keyword="${closureKeyword}"`,
    );
  }

  const labels = formatLocationLabel(raw, city, lat, lng, mapped.title);
  const resolvedDescription =
    asString(raw.description) || labels.description || asString(raw.snippet) || "";

  const providerId = asString(raw.id) ?? asString(raw.alert_id);
  const normalizedRawType = effectiveRawType.toLowerCase().trim() || undefined;
  const incidentId = stableIncidentId({
    providerId,
    type: mapped.type,
    lat,
    lng,
  });

  logRawGoogleMapsItem({
    rawId,
    incidentId,
    rawType,
    lat,
    lng,
    zoom,
    title: mapped.title,
    desc: resolvedDescription,
  });

  if (closureKeyword && mappedBase === mapped) {
    if (shouldBypassConstructionKeywordFilter(effectiveRawType, mapped)) {
      logger.info(
        `[Filter] Accident kept despite construction keywords in description | id=${incidentId} | keyword="${closureKeyword}" | rawType=${normalizedRawType ?? effectiveRawType}`,
      );
    } else {
      logGoogleMapsNotificationGate(
        incidentId,
        "DROPPED (Keyword filter)",
        `keyword="${closureKeyword}" | rawType=${normalizedRawType ?? effectiveRawType}`,
      );
      return null;
    }
  }

  const reporterName = extractReporterName(raw as Record<string, unknown>);

  return {
    id: incidentId,
    source: "google_maps",
    type: mapped.type,
    subtype: mapped.subtype,
    title: mapped.title,
    description: resolvedDescription,
    coordinates: { latitude: lat, longitude: lng },
    locationLabel: labels.locationLabel,
    severity: mapped.severity,
    timestamp: now.toISOString(),
    expiresAt: new Date(now.getTime() + config.incidentTtlMs).toISOString(),
    provider: "openwebninja_google_maps",
    googleMapsZoom: zoom,
    rawType: normalizedRawType,
    ...(reporterName ? { reporterName } : {}),
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
        mergeLane(kept) === mergeLane(incident) &&
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
      duplicate.rawType = mergeGoogleMapsRawTypePreferUpgrade(
        duplicate.rawType,
        incident.rawType,
      );
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
  // Rollback (accident only): `${ENDPOINT}?${params.toString()}&alert_types=accident`
  // Rollback (incident only): `${ENDPOINT}?${params.toString()}&alert_types=incident`
  const url = `${ENDPOINT}?${params.toString()}&alert_types=accident,incident`;
  const res = await keepAliveFetch(url, {
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

export interface GoogleMapsCityFetchResult {
  incidents: Incident[];
  tiles: number;
  fetched: number;
  retained: number;
  latencyMs: number;
}

/**
 * Poll OpenWebNinja Google Maps traffic alerts for one city.
 * Zooms 11–14: 2×2 tile grid. Zoom 15: dynamic area-split tiles (~16).
 * Completely independent of BlocksInside / Fire pipelines.
 */
export async function fetchOpenWebNinjaGoogleMapsForCity(
  city: GoogleMapsCity,
): Promise<GoogleMapsCityFetchResult> {
  const apiKey = config.openWebNinjaApiKey;
  if (!apiKey) {
    throw new Error("OPENWEBNINJA_API_KEY is not configured");
  }

  const box = city.box ?? boundingBox(city.lat, city.lng, city.radiusKm);
  const fetchJobs = buildGoogleMapsFetchJobs(box);
  const started = Date.now();
  runtime.lastFetchAt = new Date().toISOString();
  runtime.city = city.id;
  runtime.lastError = null;
  runtime.lastTypeCounts = null;

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

  logger.debug("OpenWebNinja Google Maps poll fetch details", {
    city: city.id,
    zooms: GOOGLE_MAPS_ZOOM_LEVELS.join(","),
    tileDivisionsByZoom: Object.fromEntries(
      GOOGLE_MAPS_ZOOM_LEVELS.map((zoom) => [zoom, tileDivisionsForZoom(box, zoom)]),
    ),
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

  return {
    incidents: deduped,
    tiles: fetchJobs.length,
    fetched: rawMerged.length,
    retained: deduped.length,
    latencyMs: runtime.lastLatencyMs ?? Date.now() - started,
  };
}

export async function fetchAllOpenWebNinjaGoogleMapsCities(): Promise<Incident[]> {
  const batches = await Promise.allSettled(
    GOOGLE_MAPS_CITIES.map((city) => fetchOpenWebNinjaGoogleMapsForCity(city)),
  );
  const merged: Incident[] = [];
  for (const result of batches) {
    if (result.status === "fulfilled") merged.push(...result.value.incidents);
    else {
      logger.warn("OpenWebNinja Google Maps city poll failed", {
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  }
  return dedupeGoogleMapsIncidents(merged);
}

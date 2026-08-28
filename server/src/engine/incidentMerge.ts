import type { Incident, IncidentSource, SourceDetection } from "../types/incident";
import type { IncidentStore } from "../store/incidentStore";
import { mergeGoogleMapsRawType, mergeGoogleMapsZoom } from "./googleMaps/googleMapsDisplay";
import { distanceKm } from "./geo";
import { isBreakdown, isPoliceType, isTrueCrash } from "./wazeAggregator";

/** Confirmed crash merge + push dedup radius (200 m). */
export const CONFIRMED_ACCIDENT_MERGE_RADIUS_KM = 0.2;

/** @deprecated Use CONFIRMED_ACCIDENT_MERGE_RADIUS_KM — kept for existing imports. */
export const CROSS_SOURCE_MERGE_RADIUS_KM = CONFIRMED_ACCIDENT_MERGE_RADIUS_KM;

/** Road closure / construction cluster radius (~40 m). */
export const ROAD_HAZARD_MERGE_RADIUS_KM = 0.04;

/** Generic Google Maps incident cluster merge radius (~15 m). */
export const GENERIC_ACCIDENT_MERGE_RADIUS_KM = 0.015;

/** Generic pins closer than this suppress duplicate pushes (~15 m). */
export const GENERIC_ACCIDENT_PUSH_BLOCK_RADIUS_KM = 0.015;

/**
 * Strict merge categories — proximity alone is never enough.
 * Accident ↔ road_hazard ↔ police must never merge or suppress each other.
 */
export type MergeCategory = "accident" | "breakdown" | "road_hazard" | "police" | "other";

/**
 * Finer merge lanes — confirmed crashes never merge with generic incidents or road hazards.
 * Used for proximity merge + Google Maps push dedup.
 */
export type MergeLane =
  | "confirmed_accident"
  | "generic_incident"
  | "road_hazard"
  | "police"
  | "breakdown";

const ROAD_HAZARD_RE =
  /ROAD[_\s-]?CLOSED|ROADCLOSED|CONSTRUCTION|ROADWORK|MAINTENANCE|\bCLOSURE\b/;

export function mergeCategory(incident: Incident): MergeCategory {
  const type = (incident.type ?? "").toUpperCase();
  const subtype = (incident.subtype ?? "").toUpperCase();
  const blob = `${type} ${subtype}`;

  if (isPoliceType(incident.type, incident.subtype ?? null)) return "police";

  if (ROAD_HAZARD_RE.test(blob)) return "road_hazard";

  if (isBreakdown(incident.type, incident.subtype ?? null)) return "breakdown";

  if (
    type.startsWith("ACCIDENT") ||
    type.includes("CRASH") ||
    type.includes("COLLISION") ||
    subtype === "GOOGLE_MAPS_INCIDENT" ||
    isTrueCrash(incident.type, incident.subtype ?? null)
  ) {
    return "accident";
  }

  return "other";
}

/**
 * True for explicit crash/collision rows — not generic OpenWebNinja incident pins.
 * Used for asymmetric 200 m merge/push vs tighter generic/closure radii.
 */
export function isConfirmedAccident(incident: Incident): boolean {
  if (mergeCategory(incident) !== "accident") return false;
  if (incident.subtype === "GOOGLE_MAPS_INCIDENT") return false;
  const raw = (incident.rawType ?? "").toLowerCase().trim();
  if (raw === "incident" || raw === "other") return false;

  const type = (incident.type ?? "").toUpperCase();
  return (
    type.startsWith("ACCIDENT") ||
    type.includes("CRASH") ||
    type.includes("COLLISION") ||
    isTrueCrash(incident.type, incident.subtype ?? null)
  );
}

/** Resolve merge lane for proximity merge (pair must match via sameMergeLane). */
export function mergeLane(incident: Incident): MergeLane | "other" {
  if (isPoliceType(incident.type, incident.subtype ?? null)) return "police";
  if (mergeCategory(incident) === "road_hazard") return "road_hazard";
  if (isBreakdown(incident.type, incident.subtype ?? null)) return "breakdown";
  if (isConfirmedAccident(incident)) return "confirmed_accident";
  if (
    incident.subtype === "GOOGLE_MAPS_INCIDENT" ||
    incident.rawType?.toLowerCase().trim() === "incident" ||
    incident.rawType?.toLowerCase().trim() === "other"
  ) {
    return "generic_incident";
  }
  if (mergeCategory(incident) === "accident") return "confirmed_accident";
  return "other";
}

/** Only merge when lanes match — crash ≠ generic incident ≠ road hazard. */
export function sameMergeLane(a: Incident, b: Incident): boolean {
  const left = mergeLane(a);
  const right = mergeLane(b);
  if (left === "other" || right === "other") return false;
  return left === right;
}

/** Lane-specific merge radius (call only when sameMergeLane is true). */
export function mergeProximityRadiusKm(a: Incident, _b: Incident): number {
  const lane = mergeLane(a);

  switch (lane) {
    case "confirmed_accident":
      return CONFIRMED_ACCIDENT_MERGE_RADIUS_KM;
    case "road_hazard":
      return ROAD_HAZARD_MERGE_RADIUS_KM;
    case "generic_incident":
      return GENERIC_ACCIDENT_MERGE_RADIUS_KM;
    case "police":
    case "breakdown":
      return CONFIRMED_ACCIDENT_MERGE_RADIUS_KM;
    default:
      return CONFIRMED_ACCIDENT_MERGE_RADIUS_KM;
  }
}

/** True when both rows share a mergeable category (never accident vs road_hazard). */
export function sameMergeCategory(a: Incident, b: Incident): boolean {
  const left = mergeCategory(a);
  const right = mergeCategory(b);
  if (left === "other" || right === "other") return false;
  return left === right;
}

/** Eligible for same-type proximity merge (radius varies by category). */
export function isMergeableTrafficIncident(incident: Incident): boolean {
  const category = mergeCategory(incident);
  return (
    category === "accident" ||
    category === "breakdown" ||
    category === "road_hazard" ||
    category === "police"
  );
}

export function sourceDetectionsFromIncident(incident: Incident): SourceDetection[] {
  if (incident.sourceDetections?.length) {
    return incident.sourceDetections.map((detection) => ({ ...detection }));
  }
  return [
    {
      source: incident.source,
      detectedAt: incident.timestamp,
      provider: incident.provider,
      googleMapsZoom: incident.googleMapsZoom,
      rawType: incident.rawType,
    },
  ];
}

export function mergeSourceDetections(
  existing: SourceDetection[] | undefined,
  incoming: SourceDetection[] | undefined,
): SourceDetection[] {
  const bySource = new Map<IncidentSource, SourceDetection>();
  for (const detection of [...(existing ?? []), ...(incoming ?? [])]) {
    const prev = bySource.get(detection.source);
    if (!prev) {
      bySource.set(detection.source, { ...detection });
      continue;
    }
    const keepEarliest =
      new Date(detection.detectedAt).getTime() < new Date(prev.detectedAt).getTime();
    bySource.set(detection.source, {
      source: detection.source,
      detectedAt: keepEarliest ? detection.detectedAt : prev.detectedAt,
      provider: detection.provider ?? prev.provider,
      googleMapsZoom: mergeGoogleMapsZoom(prev.googleMapsZoom, detection.googleMapsZoom),
      rawType: mergeGoogleMapsRawType(prev.rawType, detection.rawType),
    });
  }
  return [...bySource.values()].sort(
    (a, b) => new Date(a.detectedAt).getTime() - new Date(b.detectedAt).getTime(),
  );
}

export function incidentDistanceKm(a: Incident, b: Incident): number {
  return distanceKm(
    a.coordinates.latitude,
    a.coordinates.longitude,
    b.coordinates.latitude,
    b.coordinates.longitude,
  );
}

/** Both rows are generic OpenWebNinja incident pins (same merge lane). */
export function isGenericAccidentPair(a: Incident, b: Incident): boolean {
  return mergeLane(a) === "generic_incident" && mergeLane(b) === "generic_incident";
}

/** Push when a generic merge lands far enough from the cluster anchor. */
export function shouldPushOnGenericMerge(existing: Incident, incoming: Incident): boolean {
  if (!isGenericAccidentPair(existing, incoming)) return false;
  if (incoming.source !== "google_maps") return false;
  return incidentDistanceKm(existing, incoming) > GENERIC_ACCIDENT_PUSH_BLOCK_RADIUS_KM;
}

/** Feed sort key — bumps merged cards without changing first-seen `timestamp`. */
export function incidentFeedSortMs(incident: Incident): number {
  const reported = incident.lastReportedAt ?? incident.timestamp;
  const ms = Date.parse(reported);
  return Number.isFinite(ms) ? ms : 0;
}

export function withSourceDetections(incident: Incident): Incident {
  const sourceDetections = sourceDetectionsFromIncident(incident);
  const primary = sourceDetections[0];
  return {
    ...incident,
    sourceDetections,
    source: primary?.source ?? incident.source,
    timestamp: primary?.detectedAt ?? incident.timestamp,
  };
}

export function findNearbyMergeableIncident(
  store: IncidentStore,
  incoming: Incident,
): Incident | undefined {
  if (!isMergeableTrafficIncident(incoming)) return undefined;

  return store.getActive().find((existing) => {
    if (existing.id === incoming.id) return false;
    if (!isMergeableTrafficIncident(existing)) return false;
    // Lane isolation: confirmed crash ≠ generic incident ≠ road hazard.
    if (!sameMergeLane(existing, incoming)) return false;
    const radiusKm = mergeProximityRadiusKm(existing, incoming);
    return (
      distanceKm(
        existing.coordinates.latitude,
        existing.coordinates.longitude,
        incoming.coordinates.latitude,
        incoming.coordinates.longitude,
      ) <= radiusKm
    );
  });
}

export function mergeIntoExistingIncident(
  existing: Incident,
  incoming: Incident,
): Incident {
  const existingDetections = sourceDetectionsFromIncident(existing);
  const incomingDetections = sourceDetectionsFromIncident(incoming);
  const sourceDetections = mergeSourceDetections(existingDetections, incomingDetections);
  const primary = sourceDetections[0]!;
  const now = new Date().toISOString();

  return {
    ...existing,
    id: existing.id,
    source: primary.source,
    timestamp: primary.detectedAt,
    lastReportedAt: now,
    sourceDetections,
    notified: existing.notified ?? incoming.notified,
    title: existing.title || incoming.title,
    description: existing.description || incoming.description,
    locationLabel: existing.locationLabel || incoming.locationLabel,
    coordinates: existing.coordinates,
    type: existing.type,
    subtype: existing.subtype ?? incoming.subtype,
    provider: primary.provider ?? existing.provider,
    googleMapsZoom: mergeGoogleMapsZoom(existing.googleMapsZoom, incoming.googleMapsZoom),
    rawType: mergeGoogleMapsRawType(existing.rawType, incoming.rawType),
    reporterName: existing.reporterName ?? incoming.reporterName,
    expiresAt:
      new Date(existing.expiresAt).getTime() >= new Date(incoming.expiresAt).getTime()
        ? existing.expiresAt
        : incoming.expiresAt,
    severity: existing.severity,
  };
}

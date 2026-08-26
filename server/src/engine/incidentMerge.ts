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

/** Generic Google Maps incident pins (~75 m — about one short block). */
export const GENERIC_ACCIDENT_MERGE_RADIUS_KM = 0.075;

/**
 * Strict merge categories — proximity alone is never enough.
 * Accident ↔ road_hazard ↔ police must never merge or suppress each other.
 */
export type MergeCategory = "accident" | "breakdown" | "road_hazard" | "police" | "other";

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

/** Pair-aware merge radius — closures never use the 200 m crash radius. */
export function mergeProximityRadiusKm(a: Incident, b: Incident): number {
  const catA = mergeCategory(a);
  const catB = mergeCategory(b);

  if (catA === "road_hazard" && catB === "road_hazard") {
    return ROAD_HAZARD_MERGE_RADIUS_KM;
  }

  if (catA === "accident" && catB === "accident") {
    if (isConfirmedAccident(a) && isConfirmedAccident(b)) {
      return CONFIRMED_ACCIDENT_MERGE_RADIUS_KM;
    }
    return GENERIC_ACCIDENT_MERGE_RADIUS_KM;
  }

  return CONFIRMED_ACCIDENT_MERGE_RADIUS_KM;
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
    if (
      !prev ||
      new Date(detection.detectedAt).getTime() < new Date(prev.detectedAt).getTime()
    ) {
      bySource.set(detection.source, detection);
    }
  }
  return [...bySource.values()].sort(
    (a, b) => new Date(a.detectedAt).getTime() - new Date(b.detectedAt).getTime(),
  );
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
    // Type-aware: accident≠road_closed, accident≠breakdown, etc.
    if (!sameMergeCategory(existing, incoming)) return false;
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
  const novelDetections = incomingDetections.filter(
    (detection) =>
      !existingDetections.some((existingDetection) => existingDetection.source === detection.source),
  );
  const sourceDetections = mergeSourceDetections(existingDetections, novelDetections);
  const primary = sourceDetections[0]!;

  return {
    ...existing,
    id: existing.id,
    source: primary.source,
    timestamp: primary.detectedAt,
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

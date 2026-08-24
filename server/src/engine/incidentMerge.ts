import type { Incident, IncidentSource, SourceDetection } from "../types/incident";
import type { IncidentStore } from "../store/incidentStore";
import { mergeGoogleMapsZoom } from "./googleMaps/googleMapsDisplay";
import { distanceKm } from "./geo";
import { isNotifiableCrash } from "./wazeAggregator";

/** Cross-provider crash merge + push dedup radius (200 m). */
export const CROSS_SOURCE_MERGE_RADIUS_KM = 0.2;

export function isMergeableTrafficIncident(incident: Incident): boolean {
  if (incident.source === "google_maps") {
    return incident.type.toUpperCase().startsWith("ACCIDENT");
  }
  if (incident.source === "waze") {
    return isNotifiableCrash(incident.type, incident.subtype ?? null);
  }
  return false;
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
  radiusKm = CROSS_SOURCE_MERGE_RADIUS_KM,
): Incident | undefined {
  return store.getActive().find((existing) => {
    if (existing.id === incoming.id) return false;
    if (!isMergeableTrafficIncident(existing) || !isMergeableTrafficIncident(incoming)) {
      return false;
    }
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
    expiresAt:
      new Date(existing.expiresAt).getTime() >= new Date(incoming.expiresAt).getTime()
        ? existing.expiresAt
        : incoming.expiresAt,
    severity: existing.severity,
  };
}

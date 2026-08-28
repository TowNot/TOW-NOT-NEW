import type { Incident, IncidentSeverity } from "../../types/incident";
import {
  mergeIntoExistingIncident,
  sourceDetectionsFromIncident,
  withSourceDetections,
} from "../incidentMerge";
import { mergeGoogleMapsRawTypePreferUpgrade, mergeGoogleMapsZoom } from "./googleMapsDisplay";

const SEVERITY_RANK: Record<IncidentSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

/** Higher rank = stronger OpenWebNinja signal (accident > incident). */
export function googleMapsRawTypeRank(rawType?: string | null): number {
  const key = rawType?.toLowerCase().trim() ?? "";
  if (
    key === "accident" ||
    key === "crash" ||
    key === "collision" ||
    key.includes("collision") ||
    key.includes("crash")
  ) {
    return 2;
  }
  if (key === "incident" || key === "other") return 1;
  return 0;
}

/** Google Maps merge that preserves stronger rawType / subtype for display tags. */
export function mergeGoogleMapsIntoCluster(
  existing: Incident,
  incoming: Incident,
): Incident {
  const merged = mergeIntoExistingIncident(existing, withSourceDetections(incoming));
  return applyGoogleMapsClusterUpgradeFields(existing, incoming, merged);
}

export function applyGoogleMapsClusterUpgradeFields(
  existing: Incident,
  incoming: Incident,
  merged: Incident,
): Incident {
  const rawType = mergeGoogleMapsRawTypePreferUpgrade(existing.rawType, incoming.rawType);
  let { subtype, title, severity } = merged;

  if (googleMapsRawTypeRank(rawType) >= 2 && existing.subtype === "GOOGLE_MAPS_INCIDENT") {
    subtype = null;
    if (!title || title === "Traffic Incident / Collision") {
      title = "Traffic accident";
    }
  }

  if (googleMapsRawTypeRank(incoming.rawType) > googleMapsRawTypeRank(existing.rawType)) {
    if (incoming.title) title = incoming.title;
    if (incoming.subtype === null || incoming.subtype === undefined) {
      if (existing.subtype === "GOOGLE_MAPS_INCIDENT") subtype = incoming.subtype ?? null;
    } else if (incoming.subtype) {
      subtype = incoming.subtype;
    }
  }

  if (SEVERITY_RANK[incoming.severity] > SEVERITY_RANK[existing.severity]) {
    severity = incoming.severity;
  }

  return {
    ...merged,
    rawType,
    subtype,
    title,
    severity,
    googleMapsZoom: mergeGoogleMapsZoom(existing.googleMapsZoom, incoming.googleMapsZoom),
  };
}

/**
 * True only on genuine type/severity escalation (e.g. incident/other → accident).
 * Re-polls that merely add another source detection must NEVER trigger an upgrade push.
 */
export function isGoogleMapsClusterUpgrade(
  existing: Incident,
  incoming: Incident,
  merged: Incident,
): boolean {
  if (incoming.source !== "google_maps") return false;

  if (googleMapsRawTypeRank(merged.rawType) > googleMapsRawTypeRank(existing.rawType)) {
    return true;
  }

  if (
    existing.subtype === "GOOGLE_MAPS_INCIDENT" &&
    merged.subtype !== "GOOGLE_MAPS_INCIDENT" &&
    googleMapsRawTypeRank(incoming.rawType) >= 2
  ) {
    return true;
  }

  if (SEVERITY_RANK[merged.severity] > SEVERITY_RANK[existing.severity]) {
    return true;
  }

  const previousGoogle = sourceDetectionsFromIncident(existing).find(
    (detection) => detection.source === "google_maps",
  );
  if (
    incoming.rawType &&
    previousGoogle?.rawType &&
    incoming.rawType !== previousGoogle.rawType &&
    googleMapsRawTypeRank(incoming.rawType) > googleMapsRawTypeRank(previousGoogle.rawType)
  ) {
    return true;
  }

  return false;
}

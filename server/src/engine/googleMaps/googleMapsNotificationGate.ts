import type { Incident } from "../../types/incident";
import type { IncidentStore } from "../../store/incidentStore";
import { logger } from "../../logger";
import {
  CONFIRMED_ACCIDENT_MERGE_RADIUS_KM,
  GENERIC_ACCIDENT_PUSH_BLOCK_RADIUS_KM,
  mergeCategory,
  mergeLane,
  sameMergeLane,
} from "../incidentMerge";
import { isIncidentTooOldForPush } from "../pushDedup";
import { distanceKm } from "../geo";

export type GoogleMapsNotificationDecision =
  | "PUSHED NEW"
  | "MERGED WITHOUT PUSH (Existing cluster)"
  | "MERGE OFFSET PUSH"
  | "UPGRADE PUSH TRIGGERED"
  | "STORED WITHOUT PUSH (Gate blocked)"
  | "SKIPPED PUSH (Existing ID refresh)"
  | "SKIPPED PUSH (Duplicate concurrent lock)"
  | "SKIPPED PUSH (Too old)"
  | "DROPPED (Keyword filter)"
  | "DROPPED (Type filter)";

export function logGoogleMapsNotificationGate(
  incidentId: string,
  decision: GoogleMapsNotificationDecision,
  detail?: string,
): void {
  const suffix = detail ? ` | ${detail}` : "";
  const line = `[Notification Gate] ID: ${incidentId} | Decision: ${decision}${suffix}`;
  // Routine re-poll chatter stays at debug; pushes / blocks stay at info.
  if (
    decision === "MERGED WITHOUT PUSH (Existing cluster)" ||
    decision === "SKIPPED PUSH (Existing ID refresh)"
  ) {
    logger.debug(line);
    return;
  }
  logger.info(line);
}

function isAccidentType(type: string): boolean {
  return type.toUpperCase().startsWith("ACCIDENT");
}

function pushBlockRadiusKm(incident: Incident, other: Incident): number {
  if (
    mergeLane(incident) === "confirmed_accident" &&
    mergeLane(other) === "confirmed_accident"
  ) {
    return CONFIRMED_ACCIDENT_MERGE_RADIUS_KM;
  }
  return GENERIC_ACCIDENT_PUSH_BLOCK_RADIUS_KM;
}

function nearbyBlockingAccident(
  incident: Incident,
  store: IncidentStore,
): Incident | undefined {
  if (mergeCategory(incident) !== "accident") return undefined;

  return store.getActive().find((other) => {
    if (other.id === incident.id) return false;
    if (!sameMergeLane(incident, other)) return false;

    // Confirmed crashes only block on other confirmed crashes within 200 m.
    // Generic incident pins suppress push within ~15 m (same lane only).
    if (mergeLane(incident) === "confirmed_accident" && mergeLane(other) !== "confirmed_accident") {
      return false;
    }

    const radiusKm = pushBlockRadiusKm(incident, other);
    return (
      distanceKm(
        other.coordinates.latitude,
        other.coordinates.longitude,
        incident.coordinates.latitude,
        incident.coordinates.longitude,
      ) <= radiusKm
    );
  });
}

/** Why a Google Maps row was blocked from push, or null when eligible. */
export function googleMapsNotificationBlockReason(
  incident: Incident,
  store: IncidentStore,
): string | null {
  if (incident.source !== "google_maps") return "not a Google Maps incident";
  if (!isAccidentType(incident.type)) return `type ${incident.type} is not push-eligible`;

  if (isIncidentTooOldForPush(incident)) {
    return "SKIPPED PUSH (Too old)";
  }

  const nearby = nearbyBlockingAccident(incident, store);
  if (nearby) {
    const radiusM = Math.round(pushBlockRadiusKm(incident, nearby) * 1000);
    return `same-category cluster within ${radiusM}m (${nearby.id}, rawType=${nearby.rawType ?? "unknown"})`;
  }

  return null;
}

/** Google Maps ACCIDENT / GOOGLE_MAPS_INCIDENT rows at a new coordinate should push. */
export function shouldNotifyGoogleMapsIncident(
  incident: Incident,
  store: IncidentStore,
): boolean {
  return googleMapsNotificationBlockReason(incident, store) === null;
}

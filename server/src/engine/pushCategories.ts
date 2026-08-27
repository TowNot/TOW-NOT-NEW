import type { Incident } from "../types/incident";
import {
  zoneFirePushTag,
  zoneGoogleMapsAccidentsPushTag,
  zoneGoogleMapsIncidentsPushTag,
  zonePolicePushTag,
  zonePushTag,
  zoneWazePushTag,
} from "./coverageZones";
import { isPoliceType } from "./wazeAggregator";

/** Progressier recipient bucket for a single incident push. */
export type PushCategory =
  | "waze_police"
  | "waze"
  | "google_maps_accidents"
  | "google_maps_incidents"
  | "fire"
  | "zone";

const ROAD_HAZARD_RE =
  /ROAD[_\s-]?CLOSED|ROADCLOSED|CONSTRUCTION|ROADWORK|MAINTENANCE|\bCLOSURE\b/;

type MapAlertKind = "accident" | "incident" | "other";

/** Mirrors client mapAlertKind — keeps desk filters and push tags aligned. */
function mapAlertKind(incident: Pick<Incident, "type" | "subtype" | "rawType">): MapAlertKind {
  const type = (incident.type ?? "").toUpperCase();
  const subtype = (incident.subtype ?? "").toUpperCase();
  const raw = (incident.rawType ?? "").toLowerCase().trim();

  if (subtype === "GOOGLE_MAPS_INCIDENT" || raw === "incident" || raw === "other") {
    return "incident";
  }

  if (ROAD_HAZARD_RE.test(`${type} ${subtype}`) || subtype === "GOOGLE_MAPS_CLOSURE") {
    return "accident";
  }

  if (
    type.startsWith("ACCIDENT") ||
    type.includes("CRASH") ||
    type.includes("COLLISION")
  ) {
    return "accident";
  }

  return "other";
}

export function pushTagForCategory(zoneId: string, category: PushCategory): string {
  switch (category) {
    case "waze_police":
      return zonePolicePushTag(zoneId);
    case "waze":
      return zoneWazePushTag(zoneId);
    case "google_maps_accidents":
      return zoneGoogleMapsAccidentsPushTag(zoneId);
    case "google_maps_incidents":
      return zoneGoogleMapsIncidentsPushTag(zoneId);
    case "fire":
      return zoneFirePushTag(zoneId);
    default:
      return zonePushTag(zoneId);
  }
}

/** Resolve which Progressier tag should receive this incident. */
export function pushCategoryForIncident(incident: Incident): PushCategory {
  if (isPoliceType(incident.type, incident.subtype ?? null)) {
    return "waze_police";
  }
  if (incident.source === "fire_dispatch") {
    return "fire";
  }
  if (incident.source === "waze") {
    return "waze";
  }
  if (incident.source === "google_maps") {
    return mapAlertKind(incident) === "incident"
      ? "google_maps_incidents"
      : "google_maps_accidents";
  }
  return "zone";
}

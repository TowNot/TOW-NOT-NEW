import type { Incident } from "../types";

/**
 * Desk/map filter buckets for Accidents vs Incidents toggles.
 *
 * - accident: confirmed crashes + construction / road-closure pins
 * - incident: generic Google Maps incident/other pins (GOOGLE_MAPS_INCIDENT)
 * - other: police, fire/EMS, etc. — not gated by these toggles
 */
export type MapAlertKind = "accident" | "incident" | "other";

const ROAD_HAZARD_RE =
  /ROAD[_\s-]?CLOSED|ROADCLOSED|CONSTRUCTION|ROADWORK|MAINTENANCE|\bCLOSURE\b/;

export function mapAlertKind(incident: Pick<Incident, "type" | "subtype" | "rawType">): MapAlertKind {
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

export function passesMapAlertFilters(
  incident: Pick<Incident, "type" | "subtype" | "rawType">,
  showAccidents: boolean,
  showIncidents: boolean,
): boolean {
  const kind = mapAlertKind(incident);
  if (kind === "accident") return showAccidents;
  if (kind === "incident") return showIncidents;
  return true;
}

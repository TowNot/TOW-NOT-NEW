import { GOOGLE_MAPS_DEDUP_RADIUS_KM, isNotifiableCrash } from "./wazeAggregator";
import { distanceKm } from "./geo";
import type { Incident } from "../types/incident";
import type { IncidentStore } from "../store/incidentStore";

const HAZARD_ALERT_MAX_AGE_MS = 60 * 60 * 1000;

/**
 * Push gate. Only crashes, MVCs, and towable breakdowns alert; major hazards
 * pass ingestion for the map and feed but stay silent here.
 */
export function shouldNotifyIncident(incident: Incident, store: IncidentStore): boolean {
  if (!isNotifiableCrash(incident.type, incident.subtype ?? null)) return false;

  const isAccident = incident.type.toUpperCase().startsWith("ACCIDENT");
  if (!isAccident) {
    const age = Date.now() - new Date(incident.timestamp).getTime();
    if (age > HAZARD_ALERT_MAX_AGE_MS) return false;
  }

  if (incident.unverifiedAddress) return true;

  if (incident.source === "google_maps" || incident.source === "fire_dispatch") {
    const nearby = store.getActive().find((other) => {
      if (other.id === incident.id) return false;
      if (!isNotifiableCrash(other.type, other.subtype ?? null)) return false;
      return (
        distanceKm(
          other.coordinates.latitude,
          other.coordinates.longitude,
          incident.coordinates.latitude,
          incident.coordinates.longitude,
        ) <= GOOGLE_MAPS_DEDUP_RADIUS_KM
      );
    });
    if (nearby) return false;
  }

  return true;
}

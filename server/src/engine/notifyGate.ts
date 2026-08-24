import { GOOGLE_MAPS_DEDUP_RADIUS_KM, isNotifiableCrash } from "./wazeAggregator";
import { GOOGLE_MAPS_PUSH_DEDUP_RADIUS_KM } from "./googleMaps/openWebNinjaGoogleMapsScraper";
import { distanceKm } from "./geo";
import type { Incident } from "../types/incident";
import type { IncidentStore } from "../store/incidentStore";

const HAZARD_ALERT_MAX_AGE_MS = 60 * 60 * 1000;

function isAccidentType(type: string): boolean {
  return type.toUpperCase().startsWith("ACCIDENT");
}

function nearbyAccident(
  incident: Incident,
  store: IncidentStore,
  radiusKm: number,
): Incident | undefined {
  return store.getActive().find((other) => {
    if (other.id === incident.id) return false;
    if (!isAccidentType(other.type)) return false;
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

/**
 * Push gate. Only crashes, MVCs, and towable breakdowns alert; major hazards
 * pass ingestion for the map and feed but stay silent here.
 */
export function shouldNotifyIncident(incident: Incident, store: IncidentStore): boolean {
  // Google Maps ACCIDENT rows (incl. GOOGLE_MAPS_INCIDENT): push only when no
  // active accident already exists within 200 m.
  if (incident.source === "google_maps" && isAccidentType(incident.type)) {
    return !nearbyAccident(incident, store, GOOGLE_MAPS_PUSH_DEDUP_RADIUS_KM);
  }

  if (!isNotifiableCrash(incident.type, incident.subtype ?? null)) return false;

  const isAccident = isAccidentType(incident.type);
  if (!isAccident) {
    const age = Date.now() - new Date(incident.timestamp).getTime();
    if (age > HAZARD_ALERT_MAX_AGE_MS) return false;
  }

  if (incident.unverifiedAddress) return true;

  if (incident.source === "fire_dispatch") {
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

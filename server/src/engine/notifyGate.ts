import { GOOGLE_MAPS_DEDUP_RADIUS_KM, isNotifiableCrash, isPoliceType } from "./wazeAggregator";
import { shouldNotifyGoogleMapsIncident } from "./googleMaps/googleMapsNotificationGate";
import { isIncidentTooOldForPush } from "./pushDedup";
import { distanceKm } from "./geo";
import type { Incident } from "../types/incident";
import type { IncidentStore } from "../store/incidentStore";

const HAZARD_ALERT_MAX_AGE_MS = 60 * 60 * 1000;

function isAccidentType(type: string): boolean {
  return type.toUpperCase().startsWith("ACCIDENT");
}

/**
 * Push gate. Crashes, MVCs, towable breakdowns, and Waze POLICE alert.
 * Major hazards pass ingestion for the map and feed but stay silent here.
 */
export function shouldNotifyIncident(incident: Incident, store: IncidentStore): boolean {
  if (isIncidentTooOldForPush(incident)) return false;

  // Google Maps ACCIDENT rows (incl. GOOGLE_MAPS_INCIDENT): push only when no
  // active same-category accident already exists within 200 m.
  // Road_closed / construction nearby do NOT suppress the push.
  if (incident.source === "google_maps" && isAccidentType(incident.type)) {
    return shouldNotifyGoogleMapsIncident(incident, store);
  }

  // Police: always push-eligible at ingest; Progressier tags gate which
  // devices actually receive the notification (opt-in "Police Alerts").
  if (isPoliceType(incident.type, incident.subtype ?? null)) {
    return true;
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
      // STT bake-off: allow [DG]/[AAI]/[SM] siblings at the same scene to all notify.
      if (other.source === "fire_dispatch") {
        const a = incident.provider?.match(/_fire_dispatch_(dg|aai|sm)$/)?.[1];
        const b = other.provider?.match(/_fire_dispatch_(dg|aai|sm)$/)?.[1];
        if (a && b && a !== b) return false;
      }
      if (!isNotifiableCrash(other.type, other.subtype ?? null)) return false;
      if (isPoliceType(other.type, other.subtype ?? null)) return false;
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

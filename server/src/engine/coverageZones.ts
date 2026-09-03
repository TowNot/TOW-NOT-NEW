import type { BoundingBox } from "./geo";
import { getActiveMonitoredCities, normalizeCityId } from "./activeMonitoredCities";
import { isIngestZoneAllowed } from "./londonOnly";
import {
  COVERAGE_ZONES,
  getCoverageZone,
  type CoverageZoneDef,
} from "./zones.config";

export {
  COVERAGE_ZONES,
  COVERAGE_ZONE_IDS,
  getCoverageZone,
  type CoverageZoneDef,
} from "./zones.config";

/**
 * Full catalog — geometry for every supported city.
 * Waze/GMaps demand comes from Prisma selectedCity, not seed.enabled.
 */
export function catalogCoverageZones(): CoverageZoneDef[] {
  return COVERAGE_ZONES;
}

/**
 * Zones whose radio/CAD may run (seed.enabled + optional London-only lock).
 * Does not gate Waze / Google Maps scrapers.
 */
export function enabledCoverageZones(): CoverageZoneDef[] {
  return COVERAGE_ZONES.filter(
    (zone) => zone.enabled && isIngestZoneAllowed(zone.id),
  );
}

export function zoneToBoundingBox(zone: CoverageZoneDef): BoundingBox {
  return {
    bottomLeft: { lat: zone.bounds.southWest.lat, lng: zone.bounds.southWest.lng },
    topRight: { lat: zone.bounds.northEast.lat, lng: zone.bounds.northEast.lng },
  };
}

export function zoneCenter(zone: CoverageZoneDef): { lat: number; lng: number } {
  return {
    lat: (zone.bounds.southWest.lat + zone.bounds.northEast.lat) / 2,
    lng: (zone.bounds.southWest.lng + zone.bounds.northEast.lng) / 2,
  };
}

/** Resolve which catalog coverage zone contains a coordinate, if any. */
export function zoneIdForCoordinates(lat: number, lng: number): string | null {
  for (const zone of catalogCoverageZones()) {
    const { southWest, northEast } = zone.bounds;
    if (
      lat >= southWest.lat &&
      lat <= northEast.lat &&
      lng >= southWest.lng &&
      lng <= northEast.lng
    ) {
      return zone.id;
    }
  }
  return null;
}

/** Progressier tag for devices watching a single city. */
export function zonePushTag(zoneId: string): string {
  return `zone-${zoneId}`;
}

/** Progressier tag for devices that opted into Waze police alerts in a city. */
export function zonePolicePushTag(zoneId: string): string {
  return `zone-${zoneId}-waze-police`;
}

/** Opt-in tag for non-police Waze pushes in a city. */
export function zoneWazePushTag(zoneId: string): string {
  return `zone-${zoneId}-waze`;
}

/** Opt-in tag for Google Maps accident / closure pushes in a city. */
export function zoneGoogleMapsAccidentsPushTag(zoneId: string): string {
  return `zone-${zoneId}-google-maps-accidents`;
}

/** Opt-in tag for generic Google Maps incident pushes in a city. */
export function zoneGoogleMapsIncidentsPushTag(zoneId: string): string {
  return `zone-${zoneId}-google-maps-incidents`;
}

/** Opt-in tag for fire-dispatch pushes in a city. */
export function zoneFirePushTag(zoneId: string): string {
  return `zone-${zoneId}-fire`;
}

/**
 * Coverage zones demanded by live user profiles (fresh Prisma each call).
 * Catalog geometry only — ignores seed.enabled so any selected city can scrape.
 */
export async function getMonitoredCoverageZones(): Promise<CoverageZoneDef[]> {
  const active = await getActiveMonitoredCities();
  const zones: CoverageZoneDef[] = [];
  for (const id of active) {
    const zone = getCoverageZone(id);
    if (zone) zones.push(zone);
  }
  return zones;
}

/** Validate a client-provided city id against the full catalog. */
export function isKnownCityId(cityId: string): boolean {
  return normalizeCityId(cityId) !== null;
}

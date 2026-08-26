import type { BoundingBox } from "./geo";
import { getActiveMonitoredCities, normalizeCityId } from "./activeMonitoredCities";
import { isIngestZoneAllowed } from "./londonOnly";
import {
  COVERAGE_ZONES,
  type CoverageZoneDef,
} from "./zones.config";

export { COVERAGE_ZONES, COVERAGE_ZONE_IDS, type CoverageZoneDef } from "./zones.config";

/**
 * Zones that may be scraped / radio-listened right now.
 * Honors zone.enabled AND the London-only ingest lock.
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

/** Resolve which enabled coverage zone contains a coordinate, if any. */
export function zoneIdForCoordinates(lat: number, lng: number): string | null {
  for (const zone of enabledCoverageZones()) {
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

/** Coverage zones that are both ingest-enabled and selected by active users. */
export async function getMonitoredCoverageZones(): Promise<CoverageZoneDef[]> {
  const active = new Set(await getActiveMonitoredCities());
  return enabledCoverageZones().filter((zone) => active.has(zone.id));
}

/** Validate a client-provided city id against the full catalog. */
export function isKnownCityId(cityId: string): boolean {
  return normalizeCityId(cityId) !== null;
}

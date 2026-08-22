import type { BoundingBox } from "./geo";

export interface CoverageZoneDef {
  id: string;
  name: string;
  enabled: boolean;
  bounds: {
    southWest: { lat: number; lng: number };
    northEast: { lat: number; lng: number };
  };
  audio: {
    enabled: boolean;
    url: string;
    description: string;
  };
}

/**
 * Coverage zones for traffic pollers. London uses the proven accident box;
 * Brampton uses the same span (±0.09 lat, ±0.123 lng) around 43.6833, -79.7667.
 */
export const COVERAGE_ZONES: CoverageZoneDef[] = [
  {
    id: "london",
    name: "London",
    enabled: true,
    bounds: {
      southWest: { lat: 42.8949, lng: -81.3683 },
      northEast: { lat: 43.0749, lng: -81.1223 },
    },
    audio: {
      enabled: true,
      url: "",
      description: "London Fire",
    },
  },
  {
    id: "brampton",
    name: "Brampton",
    enabled: true,
    bounds: {
      southWest: { lat: 43.5933, lng: -79.8897 },
      northEast: { lat: 43.7733, lng: -79.6437 },
    },
    audio: {
      enabled: false,
      url: "",
      description: "Brampton Fire",
    },
  },
];

export function enabledCoverageZones(): CoverageZoneDef[] {
  return COVERAGE_ZONES.filter((zone) => zone.enabled);
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

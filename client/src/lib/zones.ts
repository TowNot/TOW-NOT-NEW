/** London-proven half-span for every Southern Ontario coverage box. */
const ZONE_LAT_HALF = 0.09;
const ZONE_LNG_HALF = 0.123;

/** Must stay in sync with server/src/engine/zones.config.ts */
const ZONE_SEEDS = [
  { id: "london", name: "London", center: { lat: 42.9849, lng: -81.2453 } },
  { id: "woodstock", name: "Woodstock", center: { lat: 43.1306, lng: -80.7467 } },
  { id: "kitchener", name: "Kitchener / Waterloo", center: { lat: 43.4587, lng: -80.5129 } },
  { id: "cambridge", name: "Cambridge", center: { lat: 43.3972, lng: -80.3114 } },
  { id: "milton", name: "Milton", center: { lat: 43.5167, lng: -79.8833 } },
  { id: "mississauga", name: "Mississauga", center: { lat: 43.589, lng: -79.6441 } },
  { id: "torontoCore", name: "Toronto (Core)", center: { lat: 43.6532, lng: -79.3832 } },
  { id: "etobicoke", name: "Etobicoke", center: { lat: 43.6205, lng: -79.5132 } },
  { id: "northYork", name: "North York", center: { lat: 43.7615, lng: -79.4111 } },
  { id: "scarborough", name: "Scarborough", center: { lat: 43.7731, lng: -79.2577 } },
  { id: "pickering", name: "Pickering", center: { lat: 43.8384, lng: -79.0868 } },
  { id: "ajax", name: "Ajax", center: { lat: 43.8509, lng: -79.0204 } },
  { id: "whitby", name: "Whitby", center: { lat: 43.8971, lng: -78.9422 } },
  { id: "oshawa", name: "Oshawa", center: { lat: 43.8971, lng: -78.8658 } },
  { id: "hamilton", name: "Hamilton", center: { lat: 43.2557, lng: -79.8711 } },
  { id: "burlington", name: "Burlington", center: { lat: 43.3255, lng: -79.799 } },
  { id: "oakville", name: "Oakville", center: { lat: 43.4675, lng: -79.6877 } },
  { id: "grimsby", name: "Grimsby", center: { lat: 43.1945, lng: -79.5601 } },
  { id: "lincoln", name: "Lincoln / Beamsville", center: { lat: 43.161, lng: -79.4795 } },
  { id: "stCatharines", name: "St. Catharines", center: { lat: 43.1594, lng: -79.2469 } },
  { id: "niagaraOnTheLake", name: "Niagara-on-the-Lake", center: { lat: 43.255, lng: -79.0773 } },
  { id: "niagaraFalls", name: "Niagara Falls", center: { lat: 43.0896, lng: -79.0849 } },
  { id: "fortErie", name: "Fort Erie", center: { lat: 42.9022, lng: -78.9185 } },
  { id: "brantford", name: "Brantford", center: { lat: 43.1408, lng: -80.2632 } },
  { id: "vaughan", name: "Vaughan", center: { lat: 43.8361, lng: -79.4983 } },
  { id: "richmondHill", name: "Richmond Hill", center: { lat: 43.8828, lng: -79.4403 } },
  { id: "markham", name: "Markham", center: { lat: 43.8561, lng: -79.337 } },
  { id: "bowmanville", name: "Bowmanville / Clarington", center: { lat: 43.9103, lng: -78.6874 } },
  { id: "windsor", name: "Windsor", center: { lat: 42.3149, lng: -83.0364 } },
  { id: "chatham", name: "Chatham-Kent", center: { lat: 42.4048, lng: -82.191 } },
  { id: "brampton", name: "Brampton", center: { lat: 43.6833, lng: -79.7667 } },
] as const;

export type ZoneId = (typeof ZONE_SEEDS)[number]["id"];

export interface CoverageZone {
  id: ZoneId;
  name: string;
  region: string;
  /** south-west → north-east, used to filter incidents. */
  box: {
    south: number;
    west: number;
    north: number;
    east: number;
  };
}

interface ZoneSeed {
  id: ZoneId;
  name: string;
  center: { lat: number; lng: number };
}

function boxFromCenter(center: { lat: number; lng: number }): CoverageZone["box"] {
  return {
    south: center.lat - ZONE_LAT_HALF,
    west: center.lng - ZONE_LNG_HALF,
    north: center.lat + ZONE_LAT_HALF,
    east: center.lng + ZONE_LNG_HALF,
  };
}

function buildClientZone(seed: ZoneSeed): CoverageZone {
  return {
    id: seed.id,
    name: seed.name,
    region: "Ontario",
    box: boxFromCenter(seed.center),
  };
}

export const COVERAGE_ZONES: CoverageZone[] = ZONE_SEEDS.map(buildClientZone);

export const DEFAULT_ZONE_ID: ZoneId = "london";
export const ZONE_STORAGE_KEY = "alertnav-selected-zone-id";

export function zonePushTag(zoneId: ZoneId): string {
  return `zone-${zoneId}`;
}

/**
 * Progressier tags for the active city only.
 * Passed as an array so Progressier overwrites prior tags (drops the previous city).
 */
export function progressierTagsForPush(zoneId: ZoneId): string[] {
  return ["tow-not", zonePushTag(zoneId)];
}

/** Instantly re-tag this device for `zoneId` only — previous city tags are cleared. */
export function syncProgressierPushTags(zoneId: ZoneId): void {
  try {
    window.progressier?.add?.({ tags: progressierTagsForPush(zoneId) });
  } catch {
    // Progressier may not be loaded yet.
  }
}

export function isZoneId(value: unknown): value is ZoneId {
  return COVERAGE_ZONES.some((zone) => zone.id === value);
}

export function getZone(id: string | null | undefined): CoverageZone | null {
  if (!id) return null;
  return COVERAGE_ZONES.find((zone) => zone.id === id) ?? null;
}

export function incidentInZone(
  latitude: number,
  longitude: number,
  zone: CoverageZone,
): boolean {
  return (
    latitude >= zone.box.south &&
    latitude <= zone.box.north &&
    longitude >= zone.box.west &&
    longitude <= zone.box.east
  );
}

export function zoneCenter(zone: CoverageZone): { lat: number; lng: number } {
  return {
    lat: (zone.box.south + zone.box.north) / 2,
    lng: (zone.box.west + zone.box.east) / 2,
  };
}

export function readLocalZoneId(): ZoneId | null {
  try {
    const raw = window.localStorage.getItem(ZONE_STORAGE_KEY);
    return isZoneId(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function writeLocalZoneId(id: ZoneId): void {
  try {
    window.localStorage.setItem(ZONE_STORAGE_KEY, id);
  } catch {
    // Private browsing / quota.
  }
}

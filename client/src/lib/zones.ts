/** London-proven half-span for every Southern Ontario coverage box. */
import { readPoliceAlertsEnabled } from "./policeAlerts";

const ZONE_LAT_HALF = 0.09;
const ZONE_LNG_HALF = 0.123;

/** Must stay in sync with server/src/engine/zones.config.ts */
const ZONE_SEEDS = [
  {
    id: "london",
    name: "London",
    center: { lat: 42.9849, lng: -81.2453 },
    scannedAgencies: ["Fire", "Public Works"],
  },
  {
    id: "milton",
    name: "Milton",
    center: { lat: 43.5167, lng: -79.8833 },
    scannedAgencies: ["Fire"],
  },
  {
    id: "haltonHills",
    name: "Halton Hills",
    center: { lat: 43.6475, lng: -79.9197 },
    scannedAgencies: ["Fire"],
  },
  {
    id: "kitchener",
    name: "Kitchener",
    center: { lat: 43.4587, lng: -80.5129 },
    hasEmsFeed: true,
    scannedAgencies: ["Fire", "EMS"],
  },
  {
    id: "waterloo",
    name: "Waterloo",
    center: { lat: 43.4643, lng: -80.5204 },
    hasEmsFeed: true,
    scannedAgencies: ["Fire", "EMS"],
  },
  {
    id: "cambridge",
    name: "Cambridge",
    center: { lat: 43.3972, lng: -80.3114 },
    hasEmsFeed: true,
    scannedAgencies: ["Fire", "EMS"],
  },
  {
    id: "torontoCore",
    name: "Toronto (Core)",
    center: { lat: 43.6532, lng: -79.3832 },
    scannedAgencies: ["Fire"],
  },
  {
    id: "etobicoke",
    name: "Etobicoke",
    center: { lat: 43.6205, lng: -79.5132 },
    scannedAgencies: ["Fire"],
  },
  {
    id: "northYork",
    name: "North York",
    center: { lat: 43.7615, lng: -79.4111 },
    scannedAgencies: ["Fire"],
  },
  {
    id: "scarborough",
    name: "Scarborough",
    center: { lat: 43.7731, lng: -79.2577 },
    scannedAgencies: ["Fire"],
  },
  {
    id: "hamilton",
    name: "Hamilton",
    center: { lat: 43.2557, lng: -79.8711 },
    scannedAgencies: ["Fire"],
  },
  {
    id: "burlington",
    name: "Burlington",
    center: { lat: 43.3255, lng: -79.799 },
    scannedAgencies: ["Fire"],
  },
  {
    id: "brantford",
    name: "Brantford",
    center: { lat: 43.1408, lng: -80.2632 },
    scannedAgencies: ["Fire"],
  },
  {
    id: "barrie",
    name: "Barrie",
    center: { lat: 44.3894, lng: -79.6903 },
    scannedAgencies: ["Fire"],
  },
  {
    id: "windsor",
    name: "Windsor",
    center: { lat: 42.3149, lng: -83.0364 },
    scannedAgencies: ["Fire"],
  },
  {
    id: "chatham",
    name: "Chatham-Kent",
    center: { lat: 42.4048, lng: -82.191 },
    scannedAgencies: ["Fire"],
  },
  {
    id: "mississauga",
    name: "Mississauga",
    center: { lat: 43.589, lng: -79.6441 },
    scannedAgencies: [],
  },
  {
    id: "brampton",
    name: "Brampton",
    center: { lat: 43.6833, lng: -79.7667 },
    scannedAgencies: [],
  },
  {
    id: "caledon",
    name: "Caledon",
    center: { lat: 43.8643, lng: -79.9984 },
    scannedAgencies: [],
  },
  {
    id: "vaughan",
    name: "Vaughan",
    center: { lat: 43.8361, lng: -79.4983 },
    scannedAgencies: [],
  },
  {
    id: "richmondHill",
    name: "Richmond Hill",
    center: { lat: 43.8828, lng: -79.4403 },
    scannedAgencies: [],
  },
  {
    id: "newmarket",
    name: "Newmarket / Aurora",
    center: { lat: 44.0592, lng: -79.4613 },
    scannedAgencies: [],
  },
  {
    id: "markham",
    name: "Markham",
    center: { lat: 43.8561, lng: -79.337 },
    scannedAgencies: [],
  },
  {
    id: "pickering",
    name: "Pickering",
    center: { lat: 43.8384, lng: -79.0868 },
    scannedAgencies: [],
  },
  {
    id: "ajax",
    name: "Ajax",
    center: { lat: 43.8509, lng: -79.0204 },
    scannedAgencies: [],
  },
  {
    id: "whitby",
    name: "Whitby",
    center: { lat: 43.8971, lng: -78.9422 },
    scannedAgencies: [],
  },
  {
    id: "oshawa",
    name: "Oshawa",
    center: { lat: 43.8971, lng: -78.8658 },
    scannedAgencies: [],
  },
  {
    id: "bowmanville",
    name: "Bowmanville / Clarington",
    center: { lat: 43.9103, lng: -78.6874 },
    scannedAgencies: [],
  },
  {
    id: "stCatharines",
    name: "St. Catharines",
    center: { lat: 43.1594, lng: -79.2469 },
    scannedAgencies: [],
  },
  {
    id: "niagaraFalls",
    name: "Niagara Falls",
    center: { lat: 43.0896, lng: -79.0849 },
    scannedAgencies: [],
  },
  {
    id: "fortErie",
    name: "Fort Erie",
    center: { lat: 42.9022, lng: -78.9185 },
    scannedAgencies: [],
  },
  {
    id: "grimsby",
    name: "Grimsby",
    center: { lat: 43.1945, lng: -79.5601 },
    scannedAgencies: [],
  },
  {
    id: "lincoln",
    name: "Lincoln / Beamsville",
    center: { lat: 43.161, lng: -79.4795 },
    scannedAgencies: [],
  },
  {
    id: "niagaraOnTheLake",
    name: "Niagara-on-the-Lake",
    center: { lat: 43.255, lng: -79.0773 },
    scannedAgencies: [],
  },
  {
    id: "oakville",
    name: "Oakville",
    center: { lat: 43.4675, lng: -79.6877 },
    scannedAgencies: [],
  },
  {
    id: "woodstock",
    name: "Woodstock",
    center: { lat: 43.1306, lng: -80.7467 },
    scannedAgencies: [],
  },
  {
    id: "guelph",
    name: "Guelph",
    center: { lat: 43.5448, lng: -80.2482 },
    scannedAgencies: [],
  },
] as const;

export type ZoneId = (typeof ZONE_SEEDS)[number]["id"];

export interface CoverageZone {
  id: ZoneId;
  name: string;
  region: string;
  /** Agencies monitored on this city's radio feed (empty = not configured yet). */
  scannedAgencies: string[];
  /** True when this city's radio stream includes EMS (CYKF Waterloo Region). */
  hasEmsFeed: boolean;
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
  scannedAgencies: readonly string[];
  hasEmsFeed?: boolean;
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
    scannedAgencies: [...seed.scannedAgencies],
    hasEmsFeed: seed.hasEmsFeed === true,
    box: boxFromCenter(seed.center),
  };
}

export const COVERAGE_ZONES: CoverageZone[] = ZONE_SEEDS.map(buildClientZone);

export const DEFAULT_ZONE_ID: ZoneId = "london";
export const ZONE_STORAGE_KEY = "alertnav-selected-zone-id";

export function zonePushTag(zoneId: ZoneId): string {
  return `zone-${zoneId}`;
}

/** Opt-in Progressier tag for Waze police pushes in this city. */
export function zonePolicePushTag(zoneId: ZoneId): string {
  return `zone-${zoneId}-waze-police`;
}

export interface ProgressierTagOptions {
  policeAlertsEnabled?: boolean;
}

/**
 * Progressier tags for the active city only.
 * Passed as an array so Progressier overwrites prior tags (drops the previous city).
 * When police alerts are enabled, also includes `zone-<id>-waze-police`.
 */
export function progressierTagsForPush(
  zoneId: ZoneId,
  options?: ProgressierTagOptions,
): string[] {
  const tags = ["tow-not", zonePushTag(zoneId)];
  if (options?.policeAlertsEnabled) {
    tags.push(zonePolicePushTag(zoneId));
  }
  return tags;
}

/** Instantly re-tag this device for `zoneId` only — previous city tags are cleared. */
export function syncProgressierPushTags(
  zoneId: ZoneId,
  options?: ProgressierTagOptions,
): void {
  try {
    const policeAlertsEnabled = options?.policeAlertsEnabled ?? readPoliceAlertsEnabled();
    window.progressier?.add?.({
      tags: progressierTagsForPush(zoneId, { policeAlertsEnabled }),
    });
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

export type ZoneId = "london" | "hamilton" | "mississauga" | "brampton" | "toronto";

export interface CoverageZone {
  id: ZoneId;
  name: string;
  region: string;
  /** south-west → north-east, used to filter incidents and frame the map. */
  box: {
    south: number;
    west: number;
    north: number;
    east: number;
  };
}

export const COVERAGE_ZONES: CoverageZone[] = [
  {
    id: "london",
    name: "London",
    region: "Ontario",
    box: { south: 42.8949, west: -81.3683, north: 43.0749, east: -81.1223 },
  },
  {
    id: "hamilton",
    name: "Hamilton",
    region: "Ontario",
    box: { south: 43.15, west: -80.05, north: 43.33, east: -79.7 },
  },
  {
    id: "mississauga",
    name: "Mississauga",
    region: "Ontario",
    box: { south: 43.47, west: -79.8, north: 43.67, east: -79.54 },
  },
  {
    id: "brampton",
    name: "Brampton",
    region: "Ontario",
    box: { south: 43.5933, west: -79.8897, north: 43.7733, east: -79.6437 },
  },
  {
    id: "toronto",
    name: "Toronto",
    region: "Ontario",
    box: { south: 43.58, west: -79.64, north: 43.85, east: -79.12 },
  },
];

export const DEFAULT_ZONE_ID: ZoneId = "london";
export const ZONE_STORAGE_KEY = "alertnav-selected-zone-id";
export const PUSH_ZONE_MODE_STORAGE_KEY = "alertnav-push-zone-mode";

/** Only Current City (default) vs All Enabled Cities for push targeting. */
export type PushZoneMode = "current" | "all";
export const DEFAULT_PUSH_ZONE_MODE: PushZoneMode = "current";

export function isPushZoneMode(value: unknown): value is PushZoneMode {
  return value === "current" || value === "all";
}

export function zonePushTag(zoneId: ZoneId): string {
  return `zone-${zoneId}`;
}

export const ZONE_ALL_PUSH_TAG = "zone-all";

/** Tags Progressier uses to match server-side zone-filtered pushes. */
export function progressierTagsForPush(zoneId: ZoneId, mode: PushZoneMode): string[] {
  if (mode === "all") return ["tow-not", ZONE_ALL_PUSH_TAG];
  return ["tow-not", zonePushTag(zoneId)];
}

export function syncProgressierPushTags(zoneId: ZoneId, mode: PushZoneMode): void {
  try {
    // Comma-separated string overwrites device tags with the active zone scope.
    window.progressier?.add?.({ tags: progressierTagsForPush(zoneId, mode).join(", ") });
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

export function readLocalPushZoneMode(): PushZoneMode | null {
  try {
    const raw = window.localStorage.getItem(PUSH_ZONE_MODE_STORAGE_KEY);
    return isPushZoneMode(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function writeLocalPushZoneMode(mode: PushZoneMode): void {
  try {
    window.localStorage.setItem(PUSH_ZONE_MODE_STORAGE_KEY, mode);
  } catch {
    // Private browsing / quota.
  }
}

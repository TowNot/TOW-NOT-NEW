import { getCoverageZone, type CoverageZoneDef } from "../zones.config";

/** Desk / Progressier zone ids for Toronto Fire CAD geo-fence. */
export const TORONTO_FIRE_CAD_ZONE_IDS = [
  "torontoCore",
  "scarborough",
  "northYork",
  "etobicoke",
] as const;

export type TorontoFireCadZoneId = (typeof TORONTO_FIRE_CAD_ZONE_IDS)[number];

/** Street suffix municipality codes used on the CAD feed (e.g. "ADANAC DR, SC"). */
const STREET_SUFFIX_ZONE: Record<string, TorontoFireCadZoneId> = {
  NY: "northYork",
  SC: "scarborough",
  ET: "etobicoke",
  EB: "etobicoke",
  // Former City of York — map into Toronto (Core) box for tagging.
  YK: "torontoCore",
  TO: "torontoCore",
};

/**
 * TFS beat / station area hundreds digit ≈ command:
 * 1xx North, 2xx East (Scarborough), 3xx South/Core, 4xx West (Etobicoke).
 */
export function zoneIdFromBeat(beat: string): TorontoFireCadZoneId | null {
  const n = Number.parseInt(beat.trim(), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  const hundred = Math.floor(n / 100);
  if (hundred === 1) return "northYork";
  if (hundred === 2) return "scarborough";
  if (hundred === 3) return "torontoCore";
  if (hundred === 4) return "etobicoke";
  return null;
}

export function zoneIdFromStreetSuffix(
  primeStreet: string,
): TorontoFireCadZoneId | null {
  const m = primeStreet.trim().match(/,\s*([A-Z]{2})\s*$/i);
  if (!m?.[1]) return null;
  return STREET_SUFFIX_ZONE[m[1].toUpperCase()] ?? null;
}

export function torontoFireCadZones(): CoverageZoneDef[] {
  return TORONTO_FIRE_CAD_ZONE_IDS.map((id) => getCoverageZone(id)).filter(
    (z): z is CoverageZoneDef => Boolean(z),
  );
}

/** Point-in-box among Toronto CAD zones only (ignores zone.enabled). */
export function torontoZoneIdForCoordinates(
  lat: number,
  lng: number,
): TorontoFireCadZoneId | null {
  for (const zone of torontoFireCadZones()) {
    const { southWest, northEast } = zone.bounds;
    if (
      lat >= southWest.lat &&
      lat <= northEast.lat &&
      lng >= southWest.lng &&
      lng <= northEast.lng
    ) {
      return zone.id as TorontoFireCadZoneId;
    }
  }
  // Fallback: nearest zone center among the four.
  let best: TorontoFireCadZoneId | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const zone of torontoFireCadZones()) {
    const cLat = (zone.bounds.southWest.lat + zone.bounds.northEast.lat) / 2;
    const cLng = (zone.bounds.southWest.lng + zone.bounds.northEast.lng) / 2;
    const d = (lat - cLat) ** 2 + (lng - cLng) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = zone.id as TorontoFireCadZoneId;
    }
  }
  return best;
}

export function resolveTorontoFireCadZoneId(opts: {
  primeStreet: string;
  beat: string;
  lat: number | null;
  lng: number | null;
}): TorontoFireCadZoneId {
  const fromStreet = zoneIdFromStreetSuffix(opts.primeStreet);
  if (fromStreet) return fromStreet;
  if (opts.lat != null && opts.lng != null) {
    const fromCoords = torontoZoneIdForCoordinates(opts.lat, opts.lng);
    if (fromCoords) return fromCoords;
  }
  return zoneIdFromBeat(opts.beat) ?? "torontoCore";
}

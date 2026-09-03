/**
 * Optional London-only ingest lock.
 * Default OFF so seed.enabled controls multi-city (London + Brampton today).
 * Set LONDON_ONLY_INGEST=1 to force London scrapers/radio/CAD only.
 * Does not delete city configs — only blocks ingest for non-London zones.
 */
export const LONDON_ZONE_ID = "london";

export const LONDON_ONLY_INGEST =
  process.env.LONDON_ONLY_INGEST === "1" ||
  process.env.LONDON_ONLY_INGEST === "true";

/** True when scrapers/radio/CAD may run for this zone id. */
export function isIngestZoneAllowed(zoneId: string): boolean {
  if (!LONDON_ONLY_INGEST) return true;
  return zoneId === LONDON_ZONE_ID;
}

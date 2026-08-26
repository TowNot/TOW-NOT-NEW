/**
 * Strict London-only ingest lock.
 * Default ON. Set LONDON_ONLY_INGEST=0 to allow other zone.enabled flags.
 * Does not delete city configs — only blocks scrapers / radio / CAD for them.
 */
export const LONDON_ZONE_ID = "london";

export const LONDON_ONLY_INGEST =
  process.env.LONDON_ONLY_INGEST !== "0" &&
  process.env.LONDON_ONLY_INGEST !== "false";

/** True when scrapers/radio/CAD may run for this zone id. */
export function isIngestZoneAllowed(zoneId: string): boolean {
  if (!LONDON_ONLY_INGEST) return true;
  return zoneId === LONDON_ZONE_ID;
}

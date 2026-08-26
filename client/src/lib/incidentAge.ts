/** Desk feed/map: hide anything older than 3 hours (wall-clock UTC via Date). */
export const FEED_VISIBLE_MAX_AGE_MS = 3 * 60 * 60 * 1000;

/**
 * Parse incident.timestamp as UTC (ISO-8601 with Z or offset).
 * Invalid / missing timestamps are treated as not visible.
 */
export function incidentTimestampMs(timestamp: string | undefined | null): number | null {
  if (!timestamp) return null;
  const ms = Date.parse(timestamp);
  return Number.isFinite(ms) ? ms : null;
}

/** True when the incident should appear on the live desk feed and map. */
export function isIncidentVisibleOnDesk(
  incident: { timestamp: string },
  nowMs: number = Date.now(),
): boolean {
  const ts = incidentTimestampMs(incident.timestamp);
  if (ts == null) return false;
  return nowMs - ts <= FEED_VISIBLE_MAX_AGE_MS;
}

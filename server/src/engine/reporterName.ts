/** Normalize reporter/publisher usernames; drop anonymous / empty. */
export function normalizeReporterName(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const lower = trimmed.toLowerCase();
    if (
      lower === "anonymous" ||
      lower === "anon" ||
      lower === "unknown" ||
      lower === "n/a" ||
      lower === "na" ||
      lower === "null" ||
      lower === "undefined" ||
      lower === "user" ||
      lower === "guest" ||
      lower === "google maps driver"
    ) {
      return undefined;
    }
    return trimmed;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return (
      normalizeReporterName(obj.reportByNickname) ??
      normalizeReporterName(obj.report_by_nickname) ??
      normalizeReporterName(obj.username) ??
      normalizeReporterName(obj.userName) ??
      normalizeReporterName(obj.nickname) ??
      normalizeReporterName(obj.name) ??
      normalizeReporterName(obj.displayName) ??
      normalizeReporterName(obj.display_name)
    );
  }
  return undefined;
}

/**
 * Pull reporter / publisher from Waze / BlocksInside / Maps field shapes.
 * Waze Partners feed uses `reportByNickname` (and sometimes `reportBy`).
 */
export function extractReporterName(raw: Record<string, unknown>): string | undefined {
  const direct =
    normalizeReporterName(raw.reportByNickname) ??
    normalizeReporterName(raw.report_by_nickname) ??
    normalizeReporterName(raw.reportedByNickname) ??
    normalizeReporterName(raw.reportBy) ??
    normalizeReporterName(raw.report_by) ??
    normalizeReporterName(raw.reported_by) ??
    normalizeReporterName(raw.reportedBy) ??
    normalizeReporterName(raw.reporter) ??
    normalizeReporterName(raw.reporterName) ??
    normalizeReporterName(raw.reporter_name) ??
    normalizeReporterName(raw.username) ??
    normalizeReporterName(raw.userName) ??
    normalizeReporterName(raw.nickname) ??
    normalizeReporterName(raw.author) ??
    normalizeReporterName(raw.publisher) ??
    normalizeReporterName(raw.sourceName) ??
    normalizeReporterName(raw.source_name) ??
    normalizeReporterName(raw.user) ??
    normalizeReporterName(raw.reportBy);

  if (direct) return direct;

  // BlocksInside / mirrors sometimes rename fields — scan keys once.
  for (const [key, value] of Object.entries(raw)) {
    const k = key.toLowerCase();
    if (
      k === "reportbynickname" ||
      k === "report_by_nickname" ||
      k === "reportedbynickname" ||
      k === "reportby" ||
      (k.includes("nickname") && k.includes("report"))
    ) {
      const hit = normalizeReporterName(value);
      if (hit) return hit;
    }
  }
  return undefined;
}

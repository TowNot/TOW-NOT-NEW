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
      normalizeReporterName(obj.reported_by) ??
      normalizeReporterName(obj.reportedBy) ??
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
 *
 * BlocksInside: official/verified partners (Police, MTO, …) send their name in
 * `reported_by`; crowdsourced users return null/empty → omit (anonymous).
 * Fallback to `reportByNickname` / related keys for alternate payload versions.
 */
export function extractReporterName(raw: Record<string, unknown>): string | undefined {
  const direct =
    normalizeReporterName(raw.reported_by) ??
    normalizeReporterName(raw.reportedBy) ??
    normalizeReporterName(raw.reportByNickname) ??
    normalizeReporterName(raw.report_by_nickname) ??
    normalizeReporterName(raw.reportedByNickname) ??
    normalizeReporterName(raw.reportBy) ??
    normalizeReporterName(raw.report_by) ??
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
    normalizeReporterName(raw.user);

  if (direct) return direct;

  // BlocksInside / mirrors sometimes rename fields — scan keys once.
  for (const [key, value] of Object.entries(raw)) {
    const k = key.toLowerCase();
    if (
      k === "reported_by" ||
      k === "reportedby" ||
      k === "reportbynickname" ||
      k === "report_by_nickname" ||
      k === "reportedbynickname" ||
      k === "reportby" ||
      k === "report_by" ||
      (k.includes("nickname") && k.includes("report"))
    ) {
      const hit = normalizeReporterName(value);
      if (hit) return hit;
    }
  }
  return undefined;
}

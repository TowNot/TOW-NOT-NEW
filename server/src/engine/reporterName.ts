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
      lower === "guest"
    ) {
      return undefined;
    }
    return trimmed;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return (
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

/** Pull reporter / publisher from common Waze / Maps / BlocksInside field shapes. */
export function extractReporterName(raw: Record<string, unknown>): string | undefined {
  return (
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
    normalizeReporterName(raw.reportBy)
  );
}

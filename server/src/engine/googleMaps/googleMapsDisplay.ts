/** Provider attribution for OpenWebNinja-sourced Google Maps incidents. */
export function formatOpenWebNinjaGoogleMapsLabel(
  zoom?: number | null,
  rawType?: string | null,
): string {
  const type = rawType?.trim();
  if (zoom != null && type) return `OpenWebNinja (Zoom ${zoom} - ${type}) · Google Maps`;
  if (zoom != null) return `OpenWebNinja (Zoom ${zoom}) · Google Maps`;
  if (type) return `OpenWebNinja (${type}) · Google Maps`;
  return "OpenWebNinja · Google Maps";
}

export function mergeGoogleMapsZoom(
  existing?: number | null,
  incoming?: number | null,
): number | undefined {
  if (existing == null) return incoming ?? undefined;
  if (incoming == null) return existing;
  return Math.min(existing, incoming);
}

export function mergeGoogleMapsRawType(
  existing?: string | null,
  incoming?: string | null,
): string | undefined {
  const left = existing?.trim();
  const right = incoming?.trim();
  return left || right || undefined;
}

/** Prefer stronger OpenWebNinja rawType when merging cluster rows (accident over incident). */
export function mergeGoogleMapsRawTypePreferUpgrade(
  existing?: string | null,
  incoming?: string | null,
): string | undefined {
  const left = existing?.trim();
  const right = incoming?.trim();
  if (!left) return right || undefined;
  if (!right) return left;
  const rank = (rawType: string) => {
    const key = rawType.toLowerCase();
    if (
      key === "accident" ||
      key === "crash" ||
      key === "collision" ||
      key.includes("collision") ||
      key.includes("crash")
    ) {
      return 2;
    }
    if (key === "incident" || key === "other") return 1;
    return 0;
  };
  return rank(right) > rank(left) ? right : left;
}

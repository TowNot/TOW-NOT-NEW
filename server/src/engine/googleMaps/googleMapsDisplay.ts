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

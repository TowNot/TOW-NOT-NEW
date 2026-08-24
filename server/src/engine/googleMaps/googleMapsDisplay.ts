/** Provider attribution for OpenWebNinja-sourced Google Maps incidents. */
export function formatOpenWebNinjaGoogleMapsLabel(zoom?: number | null): string {
  if (zoom != null) return `OpenWebNinja (Zoom ${zoom}) · Google Maps`;
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

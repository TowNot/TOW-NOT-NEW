/** Provider attribution for OpenWebNinja-sourced Google Maps incidents. */
export function formatOpenWebNinjaGoogleMapsLabel(zoom?: number | null): string {
  if (zoom != null) return `OpenWebNinja (Zoom ${zoom}) · Google Maps`;
  return "OpenWebNinja · Google Maps";
}

export function formatGoogleMapsProviderAttribution(
  provider?: string,
  googleMapsZoom?: number | null,
): string | null {
  if (!provider) return null;
  if (provider === "openwebninja_google_maps") {
    return formatOpenWebNinjaGoogleMapsLabel(googleMapsZoom);
  }
  const labels: Record<string, string> = {
    blocksinside: "BlocksInside",
    london_fire_dispatch: "Fire dispatch",
  };
  if (labels[provider]) return labels[provider];
  const ems = provider.match(/^([a-zA-Z]+)_ems$/);
  if (ems) return `EMS · ${ems[1]}`;
  return provider;
}

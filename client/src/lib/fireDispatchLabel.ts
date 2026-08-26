/**
 * Display names for fire_dispatch incidents.
 * London’s radio covers Fire + Public Works — use the city-specific agency name.
 */
export const LONDON_FIRE_DISPLAY_LABEL = "London Fire and Public Works";
export const GENERIC_FIRE_DISPLAY_LABEL = "Fire dispatch";

/** True when provider (`london_fire_dispatch_dg`) or zone id / city name is London. */
export function isLondonFireContext(zoneIdOrProviderOrName?: string | null): boolean {
  if (!zoneIdOrProviderOrName) return false;
  const value = zoneIdOrProviderOrName.trim().toLowerCase();
  if (value === "london") return true;
  return /^london_(?:fire_dispatch|ems)(?:_|$)/.test(value);
}

export function fireDispatchDisplayLabel(zoneIdOrProviderOrName?: string | null): string {
  return isLondonFireContext(zoneIdOrProviderOrName)
    ? LONDON_FIRE_DISPLAY_LABEL
    : GENERIC_FIRE_DISPLAY_LABEL;
}

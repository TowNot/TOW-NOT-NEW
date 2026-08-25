/** Client preference: Waze police alerts (push tags + desk/map visibility). */

export const POLICE_ALERTS_STORAGE_KEY = "alertnav-police-alerts-enabled";

/** Opt-in default: OFF so existing users are not surprised by police pushes. */
export const DEFAULT_POLICE_ALERTS_ENABLED = false;

export function isPoliceIncident(type?: string | null, subtype?: string | null): boolean {
  const t = (type ?? "").toUpperCase();
  const s = (subtype ?? "").toUpperCase();
  return t === "POLICE" || t.startsWith("POLICE_") || s.startsWith("POLICE");
}

export function readPoliceAlertsEnabled(): boolean {
  try {
    const raw = window.localStorage.getItem(POLICE_ALERTS_STORAGE_KEY);
    if (raw === null) return DEFAULT_POLICE_ALERTS_ENABLED;
    return raw === "1" || raw === "true";
  } catch {
    return DEFAULT_POLICE_ALERTS_ENABLED;
  }
}

export function writePoliceAlertsEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(POLICE_ALERTS_STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    // Private browsing / quota.
  }
}

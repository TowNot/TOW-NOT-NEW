import type { Incident, IncidentSource } from "../types";
import { passesMapAlertFilters } from "./mapAlertFilters";

export const DESK_FILTER_STORAGE_KEY = "alertnav-desk-filter-preferences";

/** Persisted Live Desk filters — sources + Google Maps alert kinds. */
export interface DeskFilterPreferences {
  showAccidents: boolean;
  showIncidents: boolean;
  waze: boolean;
  google_maps: boolean;
  fire_dispatch: boolean;
}

export const DEFAULT_DESK_FILTER_PREFERENCES: DeskFilterPreferences = {
  showAccidents: true,
  showIncidents: true,
  waze: true,
  google_maps: true,
  fire_dispatch: true,
};

const SOURCE_KEYS = ["waze", "google_maps", "fire_dispatch"] as const;
type SourceToggleKey = (typeof SOURCE_KEYS)[number];

function parseBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  return fallback;
}

export function readDeskFilterPreferences(): DeskFilterPreferences {
  try {
    const raw = window.localStorage.getItem(DESK_FILTER_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_DESK_FILTER_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<DeskFilterPreferences>;
    return {
      showAccidents: parseBool(parsed.showAccidents, DEFAULT_DESK_FILTER_PREFERENCES.showAccidents),
      showIncidents: parseBool(parsed.showIncidents, DEFAULT_DESK_FILTER_PREFERENCES.showIncidents),
      waze: parseBool(parsed.waze, DEFAULT_DESK_FILTER_PREFERENCES.waze),
      google_maps: parseBool(parsed.google_maps, DEFAULT_DESK_FILTER_PREFERENCES.google_maps),
      fire_dispatch: parseBool(parsed.fire_dispatch, DEFAULT_DESK_FILTER_PREFERENCES.fire_dispatch),
    };
  } catch {
    return { ...DEFAULT_DESK_FILTER_PREFERENCES };
  }
}

export function writeDeskFilterPreferences(next: DeskFilterPreferences): void {
  try {
    window.localStorage.setItem(DESK_FILTER_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private browsing / quota.
  }
}

export function isSourceToggleKey(source: IncidentSource): source is SourceToggleKey {
  return SOURCE_KEYS.includes(source as SourceToggleKey);
}

/** True when the incident should appear on the desk and trigger client banners. */
export function passesDeskFilters(
  incident: Pick<Incident, "source" | "type" | "subtype" | "rawType">,
  prefs: DeskFilterPreferences,
): boolean {
  if (incident.source === "waze" && !prefs.waze) return false;
  if (incident.source === "google_maps" && !prefs.google_maps) return false;
  if (incident.source === "fire_dispatch" && !prefs.fire_dispatch) return false;

  if (incident.source === "google_maps" || incident.source === "waze") {
    return passesMapAlertFilters(incident, prefs.showAccidents, prefs.showIncidents);
  }

  if (
    incident.type.toUpperCase().startsWith("ACCIDENT") ||
    incident.type.toUpperCase().includes("CRASH") ||
    incident.type.toUpperCase().includes("COLLISION")
  ) {
    return prefs.showAccidents;
  }

  return true;
}

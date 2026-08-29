import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_DESK_FILTER_PREFERENCES,
  type DeskFilterPreferences,
  isSourceToggleKey,
  readDeskFilterPreferences,
  writeDeskFilterPreferences,
} from "../lib/deskFilterPreferences";
import { syncProgressierTagsFromStorage } from "../lib/zones";
import type { IncidentSource } from "../types";

/** Persisted Accidents / Incidents / Waze / Google Maps / Fire desk filters. */
export function useDeskFilterPreferences() {
  const [preferences, setPreferences] = useState<DeskFilterPreferences>(() =>
    typeof window === "undefined" ? DEFAULT_DESK_FILTER_PREFERENCES : readDeskFilterPreferences(),
  );

  useEffect(() => {
    setPreferences(readDeskFilterPreferences());
  }, []);

  const persist = useCallback((next: DeskFilterPreferences) => {
    writeDeskFilterPreferences(next);
    setPreferences(next);
    syncProgressierTagsFromStorage();
  }, []);

  const toggleWazeAccidents = useCallback(() => {
    persist({ ...preferences, showWazeAccidents: !preferences.showWazeAccidents });
  }, [persist, preferences]);

  const toggleGoogleMapsAccidents = useCallback(() => {
    persist({
      ...preferences,
      showGoogleMapsAccidents: !preferences.showGoogleMapsAccidents,
    });
  }, [persist, preferences]);

  const toggleWazeWeather = useCallback(() => {
    persist({ ...preferences, wazeWeather: !preferences.wazeWeather });
  }, [persist, preferences]);

  const toggleIncidents = useCallback(() => {
    persist({ ...preferences, showIncidents: !preferences.showIncidents });
  }, [persist, preferences]);

  const toggleSource = useCallback(
    (source: IncidentSource) => {
      if (!isSourceToggleKey(source)) return;
      persist({ ...preferences, [source]: !preferences[source] });
    },
    [persist, preferences],
  );

  const setSourceEnabled = useCallback(
    (source: IncidentSource, enabled: boolean) => {
      if (!isSourceToggleKey(source)) return;
      persist({ ...preferences, [source]: enabled });
    },
    [persist, preferences],
  );

  return {
    preferences,
    toggleWazeAccidents,
    toggleGoogleMapsAccidents,
    toggleWazeWeather,
    toggleIncidents,
    toggleSource,
    setSourceEnabled,
  };
}

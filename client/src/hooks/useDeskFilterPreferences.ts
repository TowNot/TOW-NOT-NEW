import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_DESK_FILTER_PREFERENCES,
  type DeskFilterPreferences,
  isSourceToggleKey,
  readDeskFilterPreferences,
  writeDeskFilterPreferences,
} from "../lib/deskFilterPreferences";
import { syncSmsAlertPreferences } from "../lib/smsAlertPreferences";
import { syncProgressierTagsFromStorage } from "../lib/zones";
import type { IncidentSource } from "../types";

/** Persisted Accidents / Incidents / Weather / Waze / Google Maps / Fire desk filters. */
export function useDeskFilterPreferences() {
  const [preferences, setPreferences] = useState<DeskFilterPreferences>(() =>
    typeof window === "undefined" ? DEFAULT_DESK_FILTER_PREFERENCES : readDeskFilterPreferences(),
  );

  useEffect(() => {
    setPreferences(readDeskFilterPreferences());
    void syncSmsAlertPreferences();
  }, []);

  const persist = useCallback((next: DeskFilterPreferences) => {
    writeDeskFilterPreferences(next);
    setPreferences(next);
    syncProgressierTagsFromStorage();
    void syncSmsAlertPreferences();
  }, []);

  const toggleAccidents = useCallback(() => {
    persist({ ...preferences, showAccidents: !preferences.showAccidents });
  }, [persist, preferences]);

  const toggleIncidents = useCallback(() => {
    persist({ ...preferences, showIncidents: !preferences.showIncidents });
  }, [persist, preferences]);

  const toggleWeather = useCallback(() => {
    persist({ ...preferences, weather: !preferences.weather });
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
    toggleAccidents,
    toggleIncidents,
    toggleWeather,
    toggleSource,
    setSourceEnabled,
  };
}

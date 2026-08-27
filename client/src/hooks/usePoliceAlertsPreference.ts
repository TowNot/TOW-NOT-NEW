import { useCallback, useEffect, useState } from "react";
import {
  readPoliceAlertsEnabled,
  writePoliceAlertsEnabled,
} from "../lib/policeAlerts";
import {
  syncProgressierTagsFromStorage,
} from "../lib/zones";

/**
 * Persisted Police Alerts preference. Syncs Progressier tags so only opted-in
 * devices receive `zone-<id>-waze-police` pushes.
 */
export function usePoliceAlertsPreference() {
  const [enabled, setEnabled] = useState(() =>
    typeof window === "undefined" ? false : readPoliceAlertsEnabled(),
  );

  useEffect(() => {
    setEnabled(readPoliceAlertsEnabled());
  }, []);

  const setPoliceAlertsEnabled = useCallback((next: boolean) => {
    writePoliceAlertsEnabled(next);
    setEnabled(next);
    syncProgressierTagsFromStorage();
  }, []);

  const togglePoliceAlerts = useCallback(() => {
    setPoliceAlertsEnabled(!enabled);
  }, [enabled, setPoliceAlertsEnabled]);

  return { enabled, setPoliceAlertsEnabled, togglePoliceAlerts };
}

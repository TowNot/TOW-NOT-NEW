import { useCallback, useEffect, useState } from "react";
import {
  readPoliceAlertsEnabled,
  writePoliceAlertsEnabled,
} from "../lib/policeAlerts";
import {
  DEFAULT_ZONE_ID,
  readLocalZoneId,
  syncProgressierPushTags,
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
    syncProgressierPushTags(readLocalZoneId() ?? DEFAULT_ZONE_ID, {
      policeAlertsEnabled: next,
    });
  }, []);

  const togglePoliceAlerts = useCallback(() => {
    setPoliceAlertsEnabled(!enabled);
  }, [enabled, setPoliceAlertsEnabled]);

  return { enabled, setPoliceAlertsEnabled, togglePoliceAlerts };
}

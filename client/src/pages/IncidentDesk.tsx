import { useEffect } from "react";
import { Header } from "../components/Header";
import { IncidentFeed } from "../components/IncidentFeed";
import { PoliceAlertsSettings } from "../components/PoliceAlertsSettings";
import { SmsSettings } from "../components/SmsSettings";
import { useAlertOnNewIncidents } from "../hooks/useAlertOnNewIncidents";
import { useDeskFilterPreferences } from "../hooks/useDeskFilterPreferences";
import { useIncidents } from "../hooks/useIncidents";
import { usePoliceAlertsPreference } from "../hooks/usePoliceAlertsPreference";
import { useProgressier } from "../hooks/useProgressier";
import { usePushAlertBridge } from "../hooks/usePushAlertBridge";
import { useSelectedZone, type ZoneUser } from "../hooks/useSelectedZone";
import { syncIncidentRegistry } from "../lib/incidentRegistry";
import { isPoliceIncident } from "../lib/policeAlerts";
import { getZone, incidentInZone } from "../lib/zones";

/**
 * Public live desk (`/desk`, `/dashboard`, …). Zone preference uses Clerk when
 * signed in; guests keep `selectedZoneId` in React state + localStorage only.
 * Push tags always match the single active city.
 */
export function IncidentDesk({ user }: { user?: ZoneUser | null }) {
  const { incidents, connected, health } = useIncidents();
  const { selectedZoneId, saveZone, fallbackZone } = useSelectedZone(user);
  const { enabled: policeAlertsEnabled, togglePoliceAlerts } = usePoliceAlertsPreference();
  const {
    preferences: deskFilters,
    toggleAccidents,
    toggleIncidents,
    toggleSource,
  } = useDeskFilterPreferences();
  const activeZone = getZone(selectedZoneId) ?? fallbackZone;

  useEffect(() => {
    syncIncidentRegistry(incidents);
  }, [incidents]);

  const zoneIncidents = incidents.filter((incident) => {
    if (
      !policeAlertsEnabled &&
      isPoliceIncident(incident.type, incident.subtype)
    ) {
      return false;
    }
    return incidentInZone(
      incident.coordinates.latitude,
      incident.coordinates.longitude,
      activeZone,
    );
  });

  useProgressier();
  useAlertOnNewIncidents(zoneIncidents, deskFilters);
  usePushAlertBridge();

  return (
    <div className="min-h-screen bg-white">
      <Header
        connected={connected}
        health={health}
        zoneId={activeZone.id}
        onZoneChange={(id) => void saveZone(id)}
      />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-5 pt-6">
        <PoliceAlertsSettings
          enabled={policeAlertsEnabled}
          onToggle={togglePoliceAlerts}
        />
        <SmsSettings />
      </div>
      <IncidentFeed
        incidents={zoneIncidents}
        preferences={deskFilters}
        onToggleAccidents={toggleAccidents}
        onToggleIncidents={toggleIncidents}
        onToggleSource={toggleSource}
        zoneName={activeZone.name}
        hasFireFeed={activeZone.hasFireFeed}
        hasEmsFeed={activeZone.hasEmsFeed}
      />
    </div>
  );
}

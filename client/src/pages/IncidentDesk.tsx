import { Header } from "../components/Header";
import { IncidentFeed } from "../components/IncidentFeed";
import { SmsSettings } from "../components/SmsSettings";
import { useAlertOnNewIncidents } from "../hooks/useAlertOnNewIncidents";
import { useIncidents } from "../hooks/useIncidents";
import { useProgressier } from "../hooks/useProgressier";
import { usePushAlertBridge } from "../hooks/usePushAlertBridge";
import { useSelectedZone, type ZoneUser } from "../hooks/useSelectedZone";
import { getZone, incidentInZone } from "../lib/zones";

/**
 * Public live desk (`/desk`, `/dashboard`, …). Zone preference uses Clerk when
 * signed in; guests keep prefs in React state + localStorage only.
 */
export function IncidentDesk({ user }: { user?: ZoneUser | null }) {
  const { incidents, connected, health } = useIncidents();
  const { selectedZoneId, saveZone, savePushZoneMode, pushZoneMode, fallbackZone } =
    useSelectedZone(user);
  const activeZone = getZone(selectedZoneId) ?? fallbackZone;
  const zoneIncidents = incidents.filter((incident) =>
    incidentInZone(incident.coordinates.latitude, incident.coordinates.longitude, activeZone),
  );

  useProgressier();
  useAlertOnNewIncidents(zoneIncidents);
  usePushAlertBridge();

  return (
    <div className="min-h-screen bg-white">
      <Header
        connected={connected}
        health={health}
        zoneId={activeZone.id}
        onZoneChange={(id) => void saveZone(id)}
        pushZoneMode={pushZoneMode}
        onPushZoneModeChange={(mode) => void savePushZoneMode(mode)}
      />
      <div className="mx-auto w-full max-w-6xl px-5 pt-6">
        <SmsSettings />
      </div>
      <IncidentFeed incidents={zoneIncidents} />
    </div>
  );
}

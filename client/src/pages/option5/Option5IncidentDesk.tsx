import { useEffect, useState } from "react";
import { AuthControls } from "../../components/AuthControls";
import { IncidentFeed } from "../../components/IncidentFeed";
import { IncidentFeedFilters } from "../../components/IncidentFeedFilters";
import { SmsSettings } from "../../components/SmsSettings";
import { ZoneSwitcher } from "../../components/ZoneSwitcher";
import {
  FEED_HEADING,
  FEED_SUBHEADING,
  FILTER_PANEL_TITLE,
  SMS_PANEL_TITLE,
} from "../../design/copy";
import { useAlertOnNewIncidents } from "../../hooks/useAlertOnNewIncidents";
import { useDeskFilterPreferences } from "../../hooks/useDeskFilterPreferences";
import { useIncidents } from "../../hooks/useIncidents";
import { usePoliceAlertsPreference } from "../../hooks/usePoliceAlertsPreference";
import { useProgressier } from "../../hooks/useProgressier";
import { usePushAlertBridge } from "../../hooks/usePushAlertBridge";
import { useSelectedZone, type ZoneUser } from "../../hooks/useSelectedZone";
import { syncIncidentRegistry } from "../../lib/incidentRegistry";
import { isPoliceIncident } from "../../lib/policeAlerts";
import { getZone, incidentInZone } from "../../lib/zones";

type DockView = "feed" | "filters" | "sms";

const DOCK: { id: DockView; label: string; short: string }[] = [
  { id: "feed", label: FEED_HEADING, short: "Feed" },
  { id: "filters", label: FILTER_PANEL_TITLE, short: "Filters" },
  { id: "sms", label: SMS_PANEL_TITLE, short: "SMS" },
];

export function Option5IncidentDesk({ user }: { user?: ZoneUser | null }) {
  const [view, setView] = useState<DockView>("feed");
  const { incidents, connected, health } = useIncidents();
  const { selectedZoneId, saveZone, fallbackZone } = useSelectedZone(user);
  const { enabled: policeAlertsEnabled, togglePoliceAlerts } = usePoliceAlertsPreference();
  const {
    preferences: deskFilters,
    toggleWazeAccidents,
    toggleGoogleMapsAccidents,
    toggleWazeWeather,
    toggleIncidents,
    toggleSource,
  } = useDeskFilterPreferences();
  const activeZone = getZone(selectedZoneId) ?? fallbackZone;

  useEffect(() => {
    syncIncidentRegistry(incidents);
  }, [incidents]);

  const zoneIncidents = incidents.filter((incident) => {
    if (!policeAlertsEnabled && isPoliceIncident(incident.type, incident.subtype)) {
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

  const live = connected && health?.status === "ok";
  const activeDock = DOCK.find((item) => item.id === view)!;

  return (
    <div className="design-option5 o5-desk min-h-screen">
      <div className="o5-mesh o5-mesh-desk" aria-hidden />
      <div className="o5-grid" aria-hidden />

      <header className="o5-desk-float">
        <a href="/option-5" className="o5-desk-logo no-underline">
          AlertNav
        </a>
        <ZoneSwitcher value={activeZone.id} onChange={(id) => void saveZone(id)} dark />
        <span className={`o5-pulse-badge ${live ? "o5-pulse-live" : ""}`}>
          {live ? "live" : "offline"}
        </span>
        <AuthControls variant="dark" />
      </header>

      <div className="o5-desk-stage">
        <div className="o5-view-header">
          <h1 className="o5-view-title">{activeDock.label}</h1>
          {view === "feed" ? <p className="o5-view-sub">{FEED_SUBHEADING}</p> : null}
        </div>

        <div className="o5-glass-panel">
          {view === "feed" ? (
            <IncidentFeed
              incidents={zoneIncidents}
              preferences={deskFilters}
              zoneName={activeZone.name}
              hasFireFeed={activeZone.hasFireFeed}
              hasEmsFeed={activeZone.hasEmsFeed}
            />
          ) : null}

          {view === "filters" ? (
            <div className="o5-panel-pad">
              <IncidentFeedFilters
                preferences={deskFilters}
                policeAlertsEnabled={policeAlertsEnabled}
                onTogglePoliceAlerts={togglePoliceAlerts}
                onToggleWazeAccidents={toggleWazeAccidents}
                onToggleGoogleMapsAccidents={toggleGoogleMapsAccidents}
                onToggleWazeWeather={toggleWazeWeather}
                onToggleIncidents={toggleIncidents}
                onToggleSource={toggleSource}
                zoneName={activeZone.name}
                hasFireFeed={activeZone.hasFireFeed}
                hasEmsFeed={activeZone.hasEmsFeed}
              />
            </div>
          ) : null}

          {view === "sms" ? (
            <div className="o5-panel-pad">
              <SmsSettings embedded />
            </div>
          ) : null}
        </div>
      </div>

      <nav className="o5-dock" aria-label="Desk navigation">
        {DOCK.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={view === item.id ? "page" : undefined}
            onClick={() => setView(item.id)}
            className={view === item.id ? "o5-dock-btn o5-dock-btn-active" : "o5-dock-btn"}
          >
            <span className="o5-dock-icon" aria-hidden />
            <span className="o5-dock-label">{item.short}</span>
          </button>
        ))}
      </nav>

      <p className="o5-desk-link">
        <a href="/design-preview" className="o5-nav-link no-underline">
          Compare designs
        </a>
      </p>
    </div>
  );
}

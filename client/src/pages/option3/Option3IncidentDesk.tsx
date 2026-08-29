import { useEffect, useState } from "react";
import { AuthControls } from "../../components/AuthControls";
import { IncidentFeed } from "../../components/IncidentFeed";
import { IncidentFeedFilters } from "../../components/IncidentFeedFilters";
import { SmsSettings } from "../../components/SmsSettings";
import { ZoneSwitcher } from "../../components/ZoneSwitcher";
import {
  FILTER_PANEL_SUBTITLE,
  FILTER_PANEL_TITLE,
  SMS_PANEL_SUBTITLE,
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

type DeskTab = "feed" | "filters" | "sms";

const TABS: { id: DeskTab; label: string }[] = [
  { id: "feed", label: "Live feed" },
  { id: "filters", label: FILTER_PANEL_TITLE },
  { id: "sms", label: SMS_PANEL_TITLE },
];

export function Option3IncidentDesk({ user }: { user?: ZoneUser | null }) {
  const [tab, setTab] = useState<DeskTab>("feed");
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

  return (
    <div className="design-option3 o3-desk min-h-screen">
      <header className="o3-desk-header">
        <div className="o3-desk-header-row">
          <a href="/option-3" className="o3-wordmark o3-wordmark-sm no-underline">
            AlertNav
          </a>
          <div className="o3-tabs" role="tablist" aria-label="Desk sections">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                onClick={() => setTab(item.id)}
                className={tab === item.id ? "o3-tab o3-tab-active" : "o3-tab"}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="o3-desk-actions">
            <ZoneSwitcher value={activeZone.id} onChange={(id) => void saveZone(id)} dark />
            <span className={`o3-live-dot ${live ? "o3-live-dot-on" : ""}`} title={live ? "feed live" : "feed offline"} />
            <AuthControls variant="dark" />
          </div>
        </div>
        {tab === "filters" ? (
          <p className="o3-tab-sub">{FILTER_PANEL_SUBTITLE}</p>
        ) : null}
        {tab === "sms" ? <p className="o3-tab-sub">{SMS_PANEL_SUBTITLE}</p> : null}
      </header>

      <div className="o3-desk-body">
        {tab === "feed" ? (
          <IncidentFeed
            incidents={zoneIncidents}
            preferences={deskFilters}
            zoneName={activeZone.name}
            hasFireFeed={activeZone.hasFireFeed}
            hasEmsFeed={activeZone.hasEmsFeed}
          />
        ) : null}

        {tab === "filters" ? (
          <div className="o3-panel">
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

        {tab === "sms" ? (
          <div className="o3-panel">
            <SmsSettings embedded />
          </div>
        ) : null}

        <p className="o3-desk-foot">
          <a href="/design-preview" className="o3-link-muted no-underline">
            Compare design options
          </a>
        </p>
      </div>
    </div>
  );
}

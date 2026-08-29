import { useEffect, useState } from "react";
import { AuthControls } from "../../components/AuthControls";
import { IncidentFeed } from "../../components/IncidentFeed";
import { IncidentFeedFilters } from "../../components/IncidentFeedFilters";
import { SmsSettings } from "../../components/SmsSettings";
import { ZoneSwitcher } from "../../components/ZoneSwitcher";
import {
  FEED_HEADING,
  FEED_SUBHEADING,
  FILTER_PANEL_SUBTITLE,
  FILTER_PANEL_TITLE,
  SMS_PANEL_SUBTITLE,
  SMS_PANEL_TITLE,
} from "../../design/copy";
import { DESIGN_HUB_PATH } from "../../design/designRoutes";
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

type RailView = "feed" | "filters" | "sms";

const RAIL: { id: RailView; label: string; short: string; hint: string }[] = [
  { id: "feed", label: FEED_HEADING, short: "Feed", hint: FEED_SUBHEADING },
  { id: "filters", label: FILTER_PANEL_TITLE, short: "Filters", hint: FILTER_PANEL_SUBTITLE },
  { id: "sms", label: SMS_PANEL_TITLE, short: "SMS", hint: SMS_PANEL_SUBTITLE },
];

export function Option6IncidentDesk({ user }: { user?: ZoneUser | null }) {
  const [view, setView] = useState<RailView>("feed");
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
  const activeRail = RAIL.find((item) => item.id === view)!;

  return (
    <div className="design-option6 o6-desk min-h-screen">
      <aside className="o6-rail" aria-label="Desk navigation">
        <a href="/option-6" className="o6-rail-brand no-underline">
          <span className="o6-brand-mark o6-brand-mark-sm" aria-hidden />
          <span className="o6-rail-brand-text">AlertNav</span>
        </a>

        <nav className="o6-rail-nav">
          {RAIL.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={view === item.id ? "page" : undefined}
              onClick={() => setView(item.id)}
              className={view === item.id ? "o6-rail-btn o6-rail-btn-active" : "o6-rail-btn"}
            >
              <span className={`o6-rail-glyph o6-rail-glyph-${item.id}`} aria-hidden />
              <span className="o6-rail-label">{item.short}</span>
            </button>
          ))}
        </nav>

        <a href={DESIGN_HUB_PATH} className="o6-rail-foot no-underline">
          All designs
        </a>
      </aside>

      <div className="o6-workspace">
        <header className="o6-desk-header">
          <div className="o6-desk-heading">
            <h1 className="o6-desk-title">{activeRail.label}</h1>
            <p className="o6-desk-sub">{activeRail.hint}</p>
          </div>
          <div className="o6-desk-tools">
            <ZoneSwitcher value={activeZone.id} onChange={(id) => void saveZone(id)} />
            <span className={`o6-live-pill ${live ? "o6-live-pill-on" : ""}`}>
              <span className="o6-live-dot" aria-hidden />
              {live ? "Feed live" : "Feed offline"}
            </span>
            <AuthControls variant="light" />
          </div>
        </header>

        <div className="o6-desk-panel">
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
            <div className="o6-panel-inner">
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
            <div className="o6-panel-inner">
              <SmsSettings embedded />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

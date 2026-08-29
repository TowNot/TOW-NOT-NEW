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

type DeskPanel = "feed" | "filters" | "sms";

const PANELS: { id: DeskPanel; label: string; hint: string }[] = [
  { id: "feed", label: "Live feed", hint: "Nearby disruptions" },
  { id: "filters", label: FILTER_PANEL_TITLE, hint: FILTER_PANEL_SUBTITLE },
  { id: "sms", label: SMS_PANEL_TITLE, hint: SMS_PANEL_SUBTITLE },
];

export function Option2IncidentDesk({ user }: { user?: ZoneUser | null }) {
  const [panel, setPanel] = useState<DeskPanel>("feed");
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
    <div className="design-option2 o2-desk min-h-screen">
      <header className="o2-desk-topbar">
        <div className="o2-desk-topbar-inner">
          <div className="flex min-w-0 items-center gap-3">
            <a href="/option-2" className="o2-logo-sm no-underline">
              AlertNav
            </a>
            <span className="hidden text-stone-300 sm:inline" aria-hidden>
              /
            </span>
            <span className="hidden truncate text-sm font-medium text-stone-600 sm:inline">
              {activeZone.name}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ZoneSwitcher value={activeZone.id} onChange={(id) => void saveZone(id)} />
            <span
              className={`o2-status-pill ${live ? "o2-status-live" : "o2-status-offline"}`}
            >
              <span className="o2-status-dot" aria-hidden />
              {live ? "feed live" : "feed offline"}
            </span>
            <AuthControls variant="light" />
          </div>
        </div>
      </header>

      <div className="o2-desk-layout">
        <nav className="o2-desk-nav" aria-label="Desk sections">
          <p className="o2-desk-nav-label">Menu</p>
          {PANELS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={panel === item.id ? "page" : undefined}
              onClick={() => setPanel(item.id)}
              className={
                panel === item.id ? "o2-desk-nav-btn o2-desk-nav-btn-active" : "o2-desk-nav-btn"
              }
            >
              <span className="o2-desk-nav-btn-label">{item.label}</span>
              <span className="o2-desk-nav-btn-hint">{item.hint}</span>
            </button>
          ))}
          <a href="/design-preview" className="o2-desk-nav-link no-underline">
            ← Compare designs
          </a>
        </nav>

        <div className="o2-desk-main">
          {panel === "feed" ? (
            <>
              <div className="o2-desk-feed-header">
                <div>
                  <h1 className="o2-desk-page-title">{FEED_HEADING}</h1>
                  <p className="o2-desk-page-sub">{FEED_SUBHEADING}</p>
                </div>
              </div>
              <IncidentFeed
                incidents={zoneIncidents}
                preferences={deskFilters}
                zoneName={activeZone.name}
                hasFireFeed={activeZone.hasFireFeed}
                hasEmsFeed={activeZone.hasEmsFeed}
              />
            </>
          ) : null}

          {panel === "filters" ? (
            <section className="o2-panel-page">
              <header className="o2-panel-page-header">
                <h1 className="o2-desk-page-title">{FILTER_PANEL_TITLE}</h1>
                <p className="o2-desk-page-sub">{FILTER_PANEL_SUBTITLE}</p>
              </header>
              <div className="o2-panel-card">
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
              <p className="o2-panel-tip">
                Tip: open <strong>Live feed</strong> in the menu to see alerts with these filters
                applied.
              </p>
            </section>
          ) : null}

          {panel === "sms" ? (
            <section className="o2-panel-page">
              <header className="o2-panel-page-header">
                <h1 className="o2-desk-page-title">{SMS_PANEL_TITLE}</h1>
                <p className="o2-desk-page-sub">{SMS_PANEL_SUBTITLE}</p>
              </header>
              <div className="o2-panel-card">
                <SmsSettings embedded />
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

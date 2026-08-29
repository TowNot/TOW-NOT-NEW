import { useEffect } from "react";
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

export function Option4IncidentDesk({ user }: { user?: ZoneUser | null }) {
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
    <div className="design-option4 o4-desk min-h-screen">
      <header className="o4-desk-bar">
        <div className="o4-wrap o4-desk-bar-inner">
          <a href="/option-4" className="o4-brand o4-brand-sm no-underline">
            AlertNav
          </a>
          <div className="flex flex-wrap items-center gap-2">
            <ZoneSwitcher value={activeZone.id} onChange={(id) => void saveZone(id)} />
            <span className={`o4-status ${live ? "o4-status-live" : ""}`}>
              {live ? "feed live" : "feed offline"}
            </span>
            <AuthControls variant="light" />
          </div>
        </div>
      </header>

      <div className="o4-wrap o4-desk-scroll">
        <nav className="o4-jump-nav" aria-label="On this page">
          <a href="#o4-filters" className="o4-jump-link">
            1 · {FILTER_PANEL_TITLE}
          </a>
          <a href="#o4-sms" className="o4-jump-link">
            2 · {SMS_PANEL_TITLE}
          </a>
          <a href="#o4-feed" className="o4-jump-link">
            3 · {FEED_HEADING}
          </a>
        </nav>

        <section id="o4-filters" className="o4-desk-section o4-desk-section-filters">
          <header className="o4-section-banner">
            <span className="o4-section-num">1</span>
            <div>
              <h2 className="o4-section-title">{FILTER_PANEL_TITLE}</h2>
              <p className="o4-section-sub">{FILTER_PANEL_SUBTITLE}</p>
            </div>
          </header>
          <div className="o4-section-body">
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
        </section>

        <section id="o4-sms" className="o4-desk-section o4-desk-section-sms">
          <header className="o4-section-banner">
            <span className="o4-section-num">2</span>
            <div>
              <h2 className="o4-section-title">{SMS_PANEL_TITLE}</h2>
              <p className="o4-section-sub">{SMS_PANEL_SUBTITLE}</p>
            </div>
          </header>
          <div className="o4-section-body">
            <SmsSettings embedded />
          </div>
        </section>

        <section id="o4-feed" className="o4-desk-section o4-desk-section-feed">
          <header className="o4-section-banner">
            <span className="o4-section-num">3</span>
            <div>
              <h2 className="o4-section-title">{FEED_HEADING}</h2>
              <p className="o4-section-sub">{FEED_SUBHEADING}</p>
            </div>
          </header>
          <IncidentFeed
            incidents={zoneIncidents}
            preferences={deskFilters}
            zoneName={activeZone.name}
            hasFireFeed={activeZone.hasFireFeed}
            hasEmsFeed={activeZone.hasEmsFeed}
          />
        </section>

        <p className="o4-desk-foot">
          <a href="/design-preview" className="o4-nav-link no-underline">
            Compare design options
          </a>
        </p>
      </div>
    </div>
  );
}

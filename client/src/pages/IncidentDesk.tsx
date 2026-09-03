import { useEffect } from "react";
import { CollapsibleSection } from "../components/CollapsibleSection";
import { DeskFiltersPanel } from "../components/DeskFiltersPanel";
import { Header } from "../components/Header";
import { IncidentFeed } from "../components/IncidentFeed";
import { SmsSettings } from "../components/SmsSettings";
import {
  FILTER_PANEL_SUBTITLE,
  FILTER_PANEL_TITLE,
  SMS_PANEL_SUBTITLE,
  SMS_PANEL_TITLE,
} from "../design/copy";
import { useAlertOnNewIncidents } from "../hooks/useAlertOnNewIncidents";
import { useDeskFilterPreferences } from "../hooks/useDeskFilterPreferences";
import { useIncidents } from "../hooks/useIncidents";
import { usePoliceAlertsPreference } from "../hooks/usePoliceAlertsPreference";
import { useProgressier } from "../hooks/useProgressier";
import { usePushAlertBridge } from "../hooks/usePushAlertBridge";
import { useSelectedZone, type ZoneUser } from "../hooks/useSelectedZone";
import { useSubscriptionStatus } from "../hooks/useSubscriptionStatus";
import { syncIncidentRegistry } from "../lib/incidentRegistry";
import { isPoliceIncident } from "../lib/policeAlerts";
import { getZone, incidentInZone } from "../lib/zones";

/**
 * Community road alerts desk (`/desk`, `/dashboard`, …). Zone preference uses Clerk when
 * signed in; guests keep `selectedZoneId` in React state + localStorage only.
 * Push tags always match the single active city.
 */
export function IncidentDesk({ user }: { user?: ZoneUser | null }) {
  const { incidents, connected, health } = useIncidents();
  const { active: subscribed, loading: subscriptionLoading } = useSubscriptionStatus();
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
    <div className="page-shell min-h-screen overflow-x-clip">
      <Header
        connected={connected}
        health={health}
        zoneId={activeZone.id}
        onZoneChange={(id) => void saveZone(id)}
      />
      {!subscriptionLoading && !subscribed ? (
        <div className="mx-auto w-full min-w-0 max-w-6xl px-4 sm:px-5">
          <div className="rounded-xl border border-amber-300/40 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            Your subscription is not active yet.{" "}
            <a href="/get-started" className="font-semibold underline">
              Finish setup
            </a>{" "}
            to unlock live alerts. If you already paid, give it a minute and refresh.
          </div>
        </div>
      ) : null}
      <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-3 px-4 pt-4 sm:px-5 sm:pt-6">
        <CollapsibleSection title={FILTER_PANEL_TITLE} subtitle={FILTER_PANEL_SUBTITLE}>
          <DeskFiltersPanel
            preferences={deskFilters}
            onToggleAccidents={toggleAccidents}
            onToggleIncidents={toggleIncidents}
            onToggleSource={toggleSource}
            policeAlertsEnabled={policeAlertsEnabled}
            onTogglePoliceAlerts={togglePoliceAlerts}
            zoneName={activeZone.name}
            hasFireFeed={activeZone.hasFireFeed}
            hasEmsFeed={activeZone.hasEmsFeed}
          />
        </CollapsibleSection>
        <CollapsibleSection title={SMS_PANEL_TITLE} subtitle={SMS_PANEL_SUBTITLE}>
          <div className="sms-settings-embedded">
            <SmsSettings />
          </div>
        </CollapsibleSection>
      </div>
      <IncidentFeed
        incidents={zoneIncidents}
        preferences={deskFilters}
        zoneName={activeZone.name}
        hasFireFeed={activeZone.hasFireFeed}
        hasEmsFeed={activeZone.hasEmsFeed}
      />
    </div>
  );
}

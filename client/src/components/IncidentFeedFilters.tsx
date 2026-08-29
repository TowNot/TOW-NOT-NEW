import type { IncidentSource } from "../types";
import type { DeskFilterPreferences } from "../lib/deskFilterPreferences";

interface IncidentFeedFiltersProps {
  preferences: DeskFilterPreferences;
  policeAlertsEnabled: boolean;
  onTogglePoliceAlerts: () => void;
  onToggleWazeAccidents: () => void;
  onToggleGoogleMapsAccidents: () => void;
  onToggleWazeWeather: () => void;
  onToggleIncidents: () => void;
  onToggleSource: (source: IncidentSource) => void;
  zoneName: string;
  hasFireFeed: boolean;
  hasEmsFeed: boolean;
}

export function IncidentFeedFilters({
  preferences,
  policeAlertsEnabled,
  onTogglePoliceAlerts,
  onToggleWazeAccidents,
  onToggleGoogleMapsAccidents,
  onToggleWazeWeather,
  onToggleIncidents,
  onToggleSource,
  zoneName,
  hasFireFeed,
  hasEmsFeed,
}: IncidentFeedFiltersProps) {
  const {
    showWazeAccidents,
    showGoogleMapsAccidents,
    showIncidents,
    wazeWeather,
    waze,
    google_maps,
    fire_dispatch,
  } = preferences;

  const emsActive = hasEmsFeed;

  function toggleSource(source: IncidentSource) {
    if (source === "ems" && !hasEmsFeed) return;
    if (source === "fire_dispatch" && !hasFireFeed) return;
    onToggleSource(source);
  }

  return (
    <div className="filter-panel-inner">
      <p className="section-label">Data sources</p>
      <div
        className="flex flex-wrap items-start gap-3"
        role="group"
        aria-label="Intelligence source filters"
      >
        <div className="waze-filter-group">
          <SourceFilterButton
            label="Waze"
            active={waze}
            onClick={() => toggleSource("waze")}
            activeClass="pill-active-brand"
          />
          <p className="section-label mt-3 mb-2 text-brand">Waze alert types</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Waze alert type filters">
            <MapTypeToggle
              label="Accidents"
              description="Waze — crashes and traffic accidents"
              enabled={showWazeAccidents}
              onToggle={onToggleWazeAccidents}
              onClass="pill-active-brand"
            />
            <MapTypeToggle
              label="Police"
              description="Waze police presence — pins and pushes labeled AlertNav · Waze (Police)"
              enabled={policeAlertsEnabled}
              onToggle={onTogglePoliceAlerts}
              onClass="pill-active-brand"
            />
            <MapTypeToggle
              label="Weather"
              description="Waze weather layer on the map"
              enabled={wazeWeather}
              onToggle={onToggleWazeWeather}
              onClass="pill-active-accent"
              icon="weather"
            />
          </div>
        </div>

        <div className="google-maps-filter-group">
          <SourceFilterButton
            label="Google Maps"
            active={google_maps}
            onClick={() => toggleSource("google_maps")}
            activeClass="pill-active-accent"
          />
          <p className="section-label mt-3 mb-2 text-accent">Google Maps alert types</p>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Google Maps alert type filters"
          >
            <MapTypeToggle
              label="Accidents"
              description="Google Maps — crashes and construction / road closures"
              enabled={showGoogleMapsAccidents}
              onToggle={onToggleGoogleMapsAccidents}
              onClass="pill-active-brand"
            />
            <MapTypeToggle
              label="Incidents"
              description="Google Maps — general incident pins"
              enabled={showIncidents}
              onToggle={onToggleIncidents}
              onClass="pill-active-accent"
            />
          </div>
        </div>

        <SourceFilterButton
          label="Fire"
          active={fire_dispatch && hasFireFeed}
          disabled={!hasFireFeed}
          disabledHint={`${zoneName} Fire coming soon`}
          onClick={() => toggleSource("fire_dispatch")}
          activeClass="pill-active-fire"
        />

        <SourceFilterButton
          label="EMS"
          active={emsActive}
          disabled={!hasEmsFeed}
          disabledHint="EMS Encrypted in this Region"
          onClick={() => toggleSource("ems")}
          activeClass="pill-active-ems"
        />

        <ComingSoonSourcePill
          label="OPP First Available"
          hint="OPP First Available — coming soon"
        />
      </div>
    </div>
  );
}

function SourceFilterButton({
  label,
  active,
  disabled,
  disabledHint,
  onClick,
  activeClass,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  disabledHint?: string;
  onClick: () => void;
  activeClass: string;
}) {
  if (disabled) {
    return (
      <span
        className="pill-btn pill-btn-stack min-w-[5.5rem] cursor-not-allowed rounded-full border border-line bg-surface-muted px-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted opacity-60"
        title={disabledHint}
        aria-disabled="true"
        role="status"
      >
        <span>{label}</span>
        {disabledHint ? (
          <span className="max-w-[8rem] normal-case tracking-normal text-[10px] font-medium leading-tight">
            {disabledHint}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={
        active
          ? `pill-btn min-w-[5.5rem] rounded-full border px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] ${activeClass}`
          : "pill-btn min-w-[5.5rem] rounded-full border border-line bg-surface px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted hover:border-brand/30"
      }
    >
      {label}
    </button>
  );
}

function ComingSoonSourcePill({ label, hint }: { label: string; hint: string }) {
  return (
    <span
      className="pill-btn pill-btn-stack pill-coming-soon min-w-[5.5rem] rounded-full px-4 text-xs font-semibold uppercase tracking-[0.14em]"
      title={hint}
      aria-disabled="true"
      role="status"
    >
      <span>{label}</span>
      <span className="rounded-full border border-line bg-surface px-2 py-0.5 font-mono text-[9px] font-medium normal-case tracking-normal">
        Coming Soon
      </span>
    </span>
  );
}

function MapTypeToggle({
  label,
  description,
  enabled,
  onToggle,
  onClass,
  icon,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  onClass: string;
  icon?: "weather";
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      title={description}
      onClick={onToggle}
      className={
        enabled
          ? `pill-btn pill-btn-stack min-w-[6.5rem] rounded-full border px-4 text-xs font-semibold uppercase tracking-[0.14em] ${onClass}`
          : "pill-btn pill-btn-stack min-w-[6.5rem] rounded-full border border-line bg-surface px-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted hover:border-brand/30"
      }
    >
      <span className="inline-flex items-center justify-center gap-1">
        {icon === "weather" ? (
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
          </svg>
        ) : null}
        <span>{label}</span>
      </span>
      <span className="normal-case tracking-normal text-[10px] font-medium opacity-80">
        {enabled ? "On" : "Off"}
      </span>
    </button>
  );
}

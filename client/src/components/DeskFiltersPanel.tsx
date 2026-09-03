import type { IncidentSource } from "../types";
import type { DeskFilterPreferences } from "../lib/deskFilterPreferences";
import { PoliceAlertsSettings } from "./PoliceAlertsSettings";

const SOURCE_ORDER: IncidentSource[] = ["waze", "google_maps", "fire_dispatch", "ems"];

const SOURCE_SHORT: Record<IncidentSource, string> = {
  waze: "Waze",
  google_maps: "Google Maps",
  fire_dispatch: "Fire",
  ems: "EMS",
};

interface DeskFiltersPanelProps {
  preferences: DeskFilterPreferences;
  onToggleAccidents: () => void;
  onToggleIncidents: () => void;
  onToggleSource: (source: IncidentSource) => void;
  policeAlertsEnabled: boolean;
  onTogglePoliceAlerts: () => void;
  zoneName: string;
  hasFireFeed: boolean;
  hasEmsFeed: boolean;
}

/** Collapsible Filters body — traffic sources, alert types, decorative weather. */
export function DeskFiltersPanel({
  preferences,
  onToggleAccidents,
  onToggleIncidents,
  onToggleSource,
  policeAlertsEnabled,
  onTogglePoliceAlerts,
  zoneName,
  hasFireFeed,
  hasEmsFeed,
}: DeskFiltersPanelProps) {
  const { showAccidents, showIncidents, waze, google_maps, fire_dispatch } = preferences;

  const activeSources = new Set<IncidentSource>(
    SOURCE_ORDER.filter((source) => {
      if (source === "waze") return waze;
      if (source === "google_maps") return google_maps;
      if (source === "fire_dispatch") return fire_dispatch;
      return true;
    }),
  );

  function toggleSource(source: IncidentSource) {
    if (source === "ems" && !hasEmsFeed) return;
    if (source === "fire_dispatch" && !hasFireFeed) return;
    onToggleSource(source);
  }

  return (
    <div className="desk-filters-panel space-y-4">
      <div>
        <p className="desk-filters-section-label">Traffic sources</p>
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Traffic sources">
          {SOURCE_ORDER.map((source) => {
            const emsLocked = source === "ems" && !hasEmsFeed;
            const fireLocked = source === "fire_dispatch" && !hasFireFeed;
            const locked = emsLocked || fireLocked;
            const on = !locked && activeSources.has(source);
            const lockTitle = fireLocked
              ? `${zoneName} Fire coming soon`
              : emsLocked
                ? "EMS Encrypted in this Region"
                : undefined;
            return (
              <button
                key={source}
                type="button"
                disabled={locked}
                title={lockTitle}
                aria-pressed={on}
                aria-disabled={locked}
                onClick={() => toggleSource(source)}
                className={
                  locked
                    ? "relative cursor-not-allowed rounded-md border border-line bg-ink px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-gray-400 opacity-60"
                    : on
                      ? `rounded-md border px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${pillarOnClass(source)}`
                      : "rounded-md border border-line bg-panel px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 hover:border-gray-400"
                }
              >
                {SOURCE_SHORT[source]}
                {fireLocked ? (
                  <span className="mt-1 block normal-case tracking-normal text-[10px] font-medium text-gray-400">
                    {zoneName} Fire coming soon
                  </span>
                ) : emsLocked ? (
                  <span className="mt-1 block normal-case tracking-normal text-[10px] font-medium text-gray-400">
                    Encrypted
                  </span>
                ) : (
                  <span className="mt-1 block normal-case tracking-normal text-[10px] font-medium opacity-80">
                    {on ? "On" : "Off"}
                  </span>
                )}
              </button>
            );
          })}
          <StaticWeatherChip />
        </div>
      </div>

      <div>
        <p className="desk-filters-section-label">Alert types</p>
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Alert types">
          <MapTypeToggle
            label="Accidents"
            description="Crashes and construction / road closures"
            enabled={showAccidents}
            onToggle={onToggleAccidents}
            onClass="border-rose-300 bg-rose-50 text-rose-800"
          />
          <MapTypeToggle
            label="Incidents"
            description="General Google Maps incident pins"
            enabled={showIncidents}
            onToggle={onToggleIncidents}
            onClass="border-amber-300 bg-amber-50 text-amber-900"
          />
        </div>
        <div className="mt-3">
          <PoliceAlertsSettings enabled={policeAlertsEnabled} onToggle={onTogglePoliceAlerts} />
        </div>
      </div>
    </div>
  );
}

/** Decorative road-conditions cue; not wired to live weather data. */
function StaticWeatherChip() {
  return (
    <span
      className="inline-flex flex-col items-start rounded-md border border-amber-200 bg-gradient-to-br from-amber-50 to-amber-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-amber-900"
      title="Road conditions preview — decorative only"
      aria-label="Weather preview Clear 22 degrees"
      role="img"
    >
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true">☀️</span>
        Weather
      </span>
      <span className="mt-1 font-medium normal-case tracking-normal text-[10px] text-amber-800/90">
        Clear · 22°C
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
}: {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  onClass: string;
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
          ? `rounded-md border px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${onClass}`
          : "rounded-md border border-line bg-panel px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 hover:border-gray-400"
      }
    >
      {label}
      <span className="mt-1 block normal-case tracking-normal text-[10px] font-medium opacity-80">
        {enabled ? "On" : "Off"}
      </span>
    </button>
  );
}

function pillarOnClass(source: IncidentSource): string {
  if (source === "waze") return "border-sky-300 bg-sky-50 text-waze";
  if (source === "google_maps") return "border-emerald-300 bg-emerald-50 text-maps";
  if (source === "fire_dispatch") return "border-orange-300 bg-orange-50 text-fire";
  return "border-rose-300 bg-rose-50 text-rose-800";
}

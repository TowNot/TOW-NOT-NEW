import type { Incident, IncidentSource } from "../types";
import { fireDispatchDisplayLabel } from "../lib/fireDispatchLabel";
import type { DeskFilterPreferences } from "../lib/deskFilterPreferences";
import { passesDeskFilters } from "../lib/deskFilterPreferences";
import { IncidentCard } from "./IncidentCard";

const SOURCE_ORDER: IncidentSource[] = ["waze", "google_maps", "fire_dispatch", "ems"];

const SOURCE_SHORT: Record<IncidentSource, string> = {
  waze: "Waze",
  google_maps: "Google Maps",
  fire_dispatch: "Fire",
  ems: "EMS",
};

interface IncidentFeedProps {
  incidents: Incident[];
  preferences: DeskFilterPreferences;
  onToggleAccidents: () => void;
  onToggleIncidents: () => void;
  onToggleSource: (source: IncidentSource) => void;
  /** Display name of the active coverage city (for Fire coming-soon copy). */
  zoneName: string;
  /** When false, Fire pillar is grayed out (audio feed TBD / pending). */
  hasFireFeed: boolean;
  /** When false, EMS pillar is grayed out (encrypted / unavailable in zone). */
  hasEmsFeed: boolean;
}

export function IncidentFeed({
  incidents,
  preferences,
  onToggleAccidents,
  onToggleIncidents,
  onToggleSource,
  zoneName,
  hasFireFeed,
  hasEmsFeed,
}: IncidentFeedProps) {
  const { showAccidents, showIncidents, waze, google_maps, fire_dispatch } = preferences;

  const activeSources = new Set<IncidentSource>(
    SOURCE_ORDER.filter((source) => {
      if (source === "waze") return waze;
      if (source === "google_maps") return google_maps;
      if (source === "fire_dispatch") return fire_dispatch;
      return true;
    }),
  );

  const counts = SOURCE_ORDER.map((source) => ({
    source,
    count: incidents.filter((incident) => incident.source === source).length,
  }));

  const filtered = incidents.filter((incident) => {
    if (incident.source === "ems" && !hasEmsFeed) return false;
    if (incident.source === "fire_dispatch" && !hasFireFeed) return false;
    return passesDeskFilters(incident, preferences);
  });

  function toggleSource(source: IncidentSource) {
    if (source === "ems" && !hasEmsFeed) return;
    if (source === "fire_dispatch" && !hasFireFeed) return;
    onToggleSource(source);
  }

  return (
    <section className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-5 px-4 py-6 sm:px-5">
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Intelligence source filters"
      >
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
              ) : null}
              {emsLocked ? (
                <span className="mt-1 block normal-case tracking-normal text-[10px] font-medium text-gray-400">
                  EMS Encrypted in this Region
                </span>
              ) : null}
            </button>
          );
        })}
        {/* UI placeholder only — no OPP feed, filter, or scraper. */}
        <span
          className="inline-flex cursor-not-allowed items-center gap-2 rounded-md border border-dashed border-line bg-ink px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-gray-400 opacity-70"
          title="OPP First Available — coming soon"
          aria-disabled="true"
          role="status"
        >
          OPP First Available
          <span className="rounded border border-line bg-panel px-1.5 py-0.5 font-mono text-[9px] font-medium normal-case tracking-normal text-gray-400">
            Coming Soon
          </span>
        </span>
      </div>

      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Map alert type filters"
      >
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {counts.map((item) => {
          const emsLocked = item.source === "ems" && !hasEmsFeed;
          const fireLocked = item.source === "fire_dispatch" && !hasFireFeed;
          const locked = emsLocked || fireLocked;
          return (
            <article
              key={item.source}
              className={`rounded-lg border border-line bg-panel px-4 py-3 ${locked ? "opacity-50" : ""}`}
              title={
                fireLocked
                  ? `${zoneName} Fire coming soon`
                  : emsLocked
                    ? "EMS Encrypted in this Region"
                    : undefined
              }
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-500">
                {sourceLabel(item.source, zoneName)}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">
                {locked ? "—" : item.count}
              </p>
              <p className="text-xs text-gray-500">
                {fireLocked
                  ? `${zoneName} Fire coming soon`
                  : emsLocked
                    ? "encrypted in this region"
                    : "active in 3-hour window"}
              </p>
            </article>
          );
        })}
      </div>

      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-sm font-semibold tracking-[0.18em] uppercase text-gray-900">
            Incident feed
          </h2>
          <p className="text-xs text-gray-500">Waze · Google Maps · Fire · EMS</p>
        </div>
        <p className="font-mono text-[11px] text-gray-500">{filtered.length} live</p>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line bg-panel px-6 py-16 text-center text-sm text-gray-500">
          {incidents.length === 0
            ? "Loading…"
            : !showAccidents && !showIncidents
              ? "Turn on Accidents or Incidents to see alerts."
              : "No disruptions for the selected filters."}
        </div>
      ) : (
        <ol className="grid gap-3">
          {filtered.map((incident) => (
            <li key={incident.id}>
              <IncidentCard incident={incident} />
            </li>
          ))}
        </ol>
      )}
    </section>
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

function sourceLabel(source: IncidentSource, zoneName: string): string {
  if (source === "waze") return "Waze traffic";
  if (source === "google_maps") return "Google Maps";
  if (source === "ems") return "EMS";
  return fireDispatchDisplayLabel(zoneName);
}

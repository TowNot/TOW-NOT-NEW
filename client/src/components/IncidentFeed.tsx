import type { Incident, IncidentSource } from "../types";
import { fireDispatchDisplayLabel } from "../lib/fireDispatchLabel";
import type { DeskFilterPreferences } from "../lib/deskFilterPreferences";
import { passesDeskFilters } from "../lib/deskFilterPreferences";
import { IncidentCard } from "./IncidentCard";

const SOURCE_ORDER: IncidentSource[] = ["waze", "google_maps", "fire_dispatch", "ems"];

interface IncidentFeedProps {
  incidents: Incident[];
  preferences: DeskFilterPreferences;
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
  zoneName,
  hasFireFeed,
  hasEmsFeed,
}: IncidentFeedProps) {
  const { showAccidents, showIncidents } = preferences;

  const counts = SOURCE_ORDER.map((source) => ({
    source,
    count: incidents.filter((incident) => incident.source === source).length,
  }));

  const filtered = incidents.filter((incident) => {
    if (incident.source === "ems" && !hasEmsFeed) return false;
    if (incident.source === "fire_dispatch" && !hasFireFeed) return false;
    return passesDeskFilters(incident, preferences);
  });

  return (
    <section className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-5 px-4 py-6 sm:px-5">
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

function sourceLabel(source: IncidentSource, zoneName: string): string {
  if (source === "waze") return "Waze traffic";
  if (source === "google_maps") return "Google Maps";
  if (source === "ems") return "EMS";
  return fireDispatchDisplayLabel(zoneName);
}

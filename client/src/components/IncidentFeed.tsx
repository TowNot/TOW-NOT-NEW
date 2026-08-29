import type { Incident, IncidentSource } from "../types";
import { fireDispatchDisplayLabel } from "../lib/fireDispatchLabel";
import type { DeskFilterPreferences } from "../lib/deskFilterPreferences";
import { passesDeskFilters } from "../lib/deskFilterPreferences";
import { IncidentCard } from "./IncidentCard";

const SOURCE_ORDER: IncidentSource[] = ["waze", "google_maps", "fire_dispatch", "ems"];

interface IncidentFeedProps {
  incidents: Incident[];
  preferences: DeskFilterPreferences;
  zoneName: string;
  hasFireFeed: boolean;
  hasEmsFeed: boolean;
}

export function IncidentFeed({
  incidents,
  preferences,
  zoneName,
  hasFireFeed,
  hasEmsFeed,
}: IncidentFeedProps) {
  const { showWazeAccidents, showGoogleMapsAccidents, showIncidents } = preferences;

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
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {counts.map((item) => {
          const emsLocked = item.source === "ems" && !hasEmsFeed;
          const fireLocked = item.source === "fire_dispatch" && !hasFireFeed;
          const locked = emsLocked || fireLocked;
          const accentClass =
            item.source === "google_maps"
              ? "stat-accent"
              : item.source === "fire_dispatch"
                ? "stat-fire"
                : item.source === "ems"
                  ? "stat-ems"
                  : "";
          return (
            <article
              key={item.source}
              className={`surface-card stat-card-accent px-4 py-3 ${accentClass} ${locked ? "opacity-50" : ""}`}
              title={
                fireLocked
                  ? `${zoneName} Fire coming soon`
                  : emsLocked
                    ? "EMS Encrypted in this Region"
                    : undefined
              }
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
                {sourceLabel(item.source, zoneName)}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                {locked ? "—" : item.count}
              </p>
              <p className="text-xs text-muted">
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
          <h2 className="text-sm font-semibold tracking-[0.18em] uppercase text-foreground">
            Nearby disruptions
          </h2>
          <p className="text-xs text-muted">
            Community road alerts · Waze · Google Maps · Fire · EMS
          </p>
        </div>
        <p className="live-count font-mono text-[11px]">{filtered.length} live</p>
      </div>

      {filtered.length === 0 ? (
        <div className="surface-card empty-state border-dashed px-6 py-16 text-center text-sm text-muted">
          {incidents.length === 0
            ? "Waiting on aggregator pollers…"
            : !showWazeAccidents && !showGoogleMapsAccidents && !showIncidents
              ? "Turn on alert types under Waze or Google Maps to see more."
              : "No incidents for the selected filters."}
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

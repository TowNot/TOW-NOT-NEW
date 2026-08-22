import { useMemo, useState } from "react";
import type { Incident, IncidentSource } from "../types";
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
  /** When false, EMS pillar is grayed out (encrypted / unavailable in zone). */
  hasEmsFeed: boolean;
}

export function IncidentFeed({ incidents, hasEmsFeed }: IncidentFeedProps) {
  const [activeSources, setActiveSources] = useState<Set<IncidentSource>>(
    () => new Set(SOURCE_ORDER),
  );

  const counts = SOURCE_ORDER.map((source) => ({
    source,
    count: incidents.filter((incident) => incident.source === source).length,
  }));

  const filtered = useMemo(
    () =>
      incidents.filter((incident) => {
        if (incident.source === "ems" && !hasEmsFeed) return false;
        return activeSources.has(incident.source);
      }),
    [incidents, activeSources, hasEmsFeed],
  );

  function toggleSource(source: IncidentSource) {
    if (source === "ems" && !hasEmsFeed) return;
    setActiveSources((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  }

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-5 py-6">
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Intelligence source filters"
      >
        {SOURCE_ORDER.map((source) => {
          const emsLocked = source === "ems" && !hasEmsFeed;
          const on = !emsLocked && activeSources.has(source);
          return (
            <button
              key={source}
              type="button"
              disabled={emsLocked}
              title={emsLocked ? "EMS Encrypted in this Region" : undefined}
              aria-pressed={on}
              aria-disabled={emsLocked}
              onClick={() => toggleSource(source)}
              className={
                emsLocked
                  ? "relative cursor-not-allowed rounded-md border border-line bg-ink px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-gray-400 opacity-60"
                  : on
                    ? `rounded-md border px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${pillarOnClass(source)}`
                    : "rounded-md border border-line bg-panel px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 hover:border-gray-400"
              }
            >
              {SOURCE_SHORT[source]}
              {emsLocked ? (
                <span className="mt-1 block normal-case tracking-normal text-[10px] font-medium text-gray-400">
                  EMS Encrypted in this Region
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {counts.map((item) => {
          const emsLocked = item.source === "ems" && !hasEmsFeed;
          return (
            <article
              key={item.source}
              className={`rounded-lg border border-line bg-panel px-4 py-3 ${emsLocked ? "opacity-50" : ""}`}
              title={emsLocked ? "EMS Encrypted in this Region" : undefined}
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-500">
                {sourceLabel(item.source)}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">
                {emsLocked ? "—" : item.count}
              </p>
              <p className="text-xs text-gray-500">
                {emsLocked ? "encrypted in this region" : "active in 3-hour window"}
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
            ? "Waiting on aggregator pollers…"
            : "No incidents for the selected sources."}
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

function pillarOnClass(source: IncidentSource): string {
  if (source === "waze") return "border-sky-300 bg-sky-50 text-waze";
  if (source === "google_maps") return "border-emerald-300 bg-emerald-50 text-maps";
  if (source === "fire_dispatch") return "border-orange-300 bg-orange-50 text-fire";
  return "border-rose-300 bg-rose-50 text-rose-800";
}

function sourceLabel(source: IncidentSource): string {
  if (source === "waze") return "Waze traffic";
  if (source === "google_maps") return "Google Maps";
  if (source === "ems") return "EMS";
  return "Fire dispatch";
}

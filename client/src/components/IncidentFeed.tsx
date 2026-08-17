import type { Incident, IncidentSource } from "../types";
import { IncidentCard } from "./IncidentCard";

const SOURCE_ORDER: IncidentSource[] = ["fire_dispatch", "waze", "google_maps"];

interface IncidentFeedProps {
  incidents: Incident[];
}

export function IncidentFeed({ incidents }: IncidentFeedProps) {
  const counts = SOURCE_ORDER.map((source) => ({
    source,
    count: incidents.filter((incident) => incident.source === source).length,
  }));

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-5 py-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {counts.map((item) => (
          <article
            key={item.source}
            className="rounded-lg border border-line bg-panel px-4 py-3"
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-500">
              {sourceLabel(item.source)}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{item.count}</p>
            <p className="text-xs text-gray-500">active in 3-hour window</p>
          </article>
        ))}
      </div>

      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-sm font-semibold tracking-[0.18em] uppercase text-gray-900">Incident feed</h2>
          <p className="text-xs text-gray-500">Waze · Google Maps · Fire dispatch</p>
        </div>
        <p className="font-mono text-[11px] text-gray-500">{incidents.length} live</p>
      </div>

      {incidents.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line bg-panel px-6 py-16 text-center text-sm text-gray-500">
          Waiting on aggregator pollers…
        </div>
      ) : (
        <ol className="grid gap-3">
          {incidents.map((incident) => (
            <li key={incident.id}>
              <IncidentCard incident={incident} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function sourceLabel(source: IncidentSource): string {
  if (source === "waze") return "Waze traffic";
  if (source === "google_maps") return "Google Maps";
  return "Fire dispatch";
}

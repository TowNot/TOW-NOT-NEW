import type { Incident, IncidentSeverity, IncidentSource } from "../types";

export function IncidentCard({ incident }: { incident: Incident }) {
  return (
    <article className="grid gap-3 rounded-lg border border-line bg-panel/80 p-4 md:grid-cols-[9rem_1fr_auto]">
      <div className="flex items-start justify-between gap-3 md:block">
        <SourceBadge source={incident.source} />
        <div className="md:mt-2">
          <SeverityMark severity={incident.severity} />
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
            {incident.notified ? "alerted" : "silent"}
          </p>
        </div>
      </div>
      <div>
        <h3 className="text-base font-semibold">{incident.title}</h3>
        <p className="mt-1 text-sm text-slate-300">{incident.description}</p>
        <p className="mt-2 font-mono text-[11px] text-slate-400">{incident.locationLabel}</p>
      </div>
      <div className="font-mono text-[11px] text-slate-500 md:text-right">
        <p>{formatClock(incident.timestamp)}</p>
        <p>
          {incident.coordinates.latitude.toFixed(4)}, {incident.coordinates.longitude.toFixed(4)}
        </p>
        <p className="mt-1 uppercase tracking-widest">{incident.type.replaceAll("_", " ")}</p>
      </div>
    </article>
  );
}

function SourceBadge({ source }: { source: IncidentSource }) {
  const styles: Record<IncidentSource, string> = {
    waze: "border-waze/40 bg-waze/10 text-waze",
    google_maps: "border-maps/40 bg-maps/10 text-maps",
    fire_dispatch: "border-fire/40 bg-fire/10 text-fire",
  };
  const labels: Record<IncidentSource, string> = {
    waze: "Waze",
    google_maps: "Google Maps",
    fire_dispatch: "Fire dispatch",
  };
  return (
    <span className={`inline-flex rounded border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${styles[source]}`}>
      {labels[source]}
    </span>
  );
}

function SeverityMark({ severity }: { severity: IncidentSeverity }) {
  const color: Record<IncidentSeverity, string> = {
    low: "text-slate-400",
    medium: "text-amber-300",
    high: "text-orange-400",
    critical: "text-red-400",
  };
  return <p className={`font-mono text-[10px] uppercase tracking-[0.18em] ${color[severity]}`}>{severity}</p>;
}

function formatClock(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "America/Toronto",
  }).format(new Date(iso));
}

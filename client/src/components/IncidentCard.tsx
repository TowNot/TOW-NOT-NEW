import type { Incident, IncidentSeverity, IncidentSource } from "../types";

export function IncidentCard({ incident }: { incident: Incident }) {
  const { latitude: lat, longitude: lng } = incident.coordinates;
  const wazeUrl = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

  return (
    <article className="grid gap-3 rounded-lg border border-line bg-panel p-4 md:grid-cols-[9rem_1fr_auto]">
      <div className="flex items-start justify-between gap-3 md:block">
        <SourceBadge source={incident.source} />
        <div className="md:mt-2">
          <SeverityMark severity={incident.severity} />
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-gray-400">
            {incident.notified ? "alerted" : "silent"}
          </p>
        </div>
      </div>
      <div>
        <h3 className="text-base font-semibold text-gray-900">{incident.title}</h3>
        <p className="mt-1 text-sm text-gray-600">{incident.description}</p>
        <p className="mt-2 font-mono text-[11px] text-gray-500">{incident.locationLabel}</p>
        {incident.provider ? (
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-gray-400">
            via {formatProvider(incident.provider)}
          </p>
        ) : null}
        {incident.audioUrl ? (
          <div className="mt-3">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-orange-700">
              Dispatch audio
            </p>
            <audio controls preload="none" className="h-8 w-full max-w-md">
              <source src={incident.audioUrl} type="audio/wav" />
            </audio>
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <NavLink href={wazeUrl} label="Open in Waze" />
          <NavLink href={googleMapsUrl} label="Open in Google Maps" />
        </div>
      </div>
      <div className="font-mono text-[11px] text-gray-500 md:text-right">
        <p>{formatClock(incident.timestamp)}</p>
        <p className="mt-1">
          {lat.toFixed(4)}, {lng.toFixed(4)}
        </p>
        <p className="mt-1 uppercase tracking-widest">{incident.type.replaceAll("_", " ")}</p>
      </div>
    </article>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex rounded-md border border-line bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 no-underline hover:border-gray-400 hover:bg-ink"
    >
      {label}
    </a>
  );
}

function formatProvider(provider: string): string {
  const labels: Record<string, string> = {
    blocksinside: "BlocksInside",
    openwebninja_google_maps: "OpenWebNinja · Google Maps",
    london_fire_dispatch: "Fire dispatch",
  };
  if (labels[provider]) return labels[provider];
  const ems = provider.match(/^([a-zA-Z]+)_ems$/);
  if (ems) return `EMS · ${ems[1]}`;
  return provider;
}

function SourceBadge({ source }: { source: IncidentSource }) {
  const styles: Record<IncidentSource, string> = {
    waze: "border-sky-200 bg-sky-50 text-waze",
    google_maps: "border-emerald-200 bg-emerald-50 text-maps",
    fire_dispatch: "border-orange-200 bg-orange-50 text-fire",
    ems: "border-rose-200 bg-rose-50 text-rose-800",
  };
  const labels: Record<IncidentSource, string> = {
    waze: "Waze",
    google_maps: "Google Maps",
    fire_dispatch: "Fire dispatch",
    ems: "EMS",
  };
  return (
    <span className={`inline-flex rounded border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${styles[source]}`}>
      {labels[source]}
    </span>
  );
}

function SeverityMark({ severity }: { severity: IncidentSeverity }) {
  const color: Record<IncidentSeverity, string> = {
    low: "text-gray-500",
    medium: "text-amber-700",
    high: "text-orange-700",
    critical: "text-red-700",
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

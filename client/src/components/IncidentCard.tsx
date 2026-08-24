import type { Incident, IncidentSeverity, IncidentSource } from "../types";
import {
  formatDetectionClock,
  formatSourceDetectionLabel,
  incidentSourceDetections,
  sourceLabel,
} from "../lib/incidentDisplay";
import { showTrafficMapThumbnail } from "../lib/osmStaticMap";
import { IncidentMapThumbnail } from "./IncidentMapThumbnail";

export function IncidentCard({ incident }: { incident: Incident }) {
  const { latitude: lat, longitude: lng } = incident.coordinates;
  const wazeUrl = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  const detections = incidentSourceDetections(incident);
  const showMap = detections.some(
    (detection) => detection.source === "waze" || detection.source === "google_maps",
  );

  return (
    <article className="grid gap-3 rounded-lg border border-line bg-panel p-4 md:grid-cols-[9rem_1fr_auto]">
      <div className="flex items-start justify-between gap-3 md:block">
        <SourceBadges detections={detections} />
        <div className="md:mt-2">
          <SeverityMark severity={incident.severity} />
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-gray-400">
            {incident.notified ? "alerted" : "silent"}
          </p>
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row">
        {showMap ? <IncidentMapThumbnail lat={lat} lng={lng} /> : null}
        <div className="min-w-0 flex-1">
        <h3 className="text-base font-semibold text-gray-900">{incident.title}</h3>
        <p className="mt-1 text-sm text-gray-600">{incident.description}</p>
        <p className="mt-2 font-mono text-[11px] text-gray-500">{incident.locationLabel}</p>
        <SourceDetectionTimeline detections={detections} />
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

function SourceDetectionTimeline({ detections }: { detections: ReturnType<typeof incidentSourceDetections> }) {
  if (detections.length === 0) return null;

  return (
    <div className="mt-2 space-y-1">
      {detections.map((detection, index) => (
        <p
          key={`${detection.source}-${detection.detectedAt}`}
          className="font-mono text-[10px] uppercase tracking-[0.12em] text-gray-400"
        >
          {index === 0 ? "Primary" : "Confirmed"} · {formatSourceDetectionLabel(detection)} ·{" "}
          {formatDetectionClock(detection.detectedAt)}
        </p>
      ))}
    </div>
  );
}

function SourceBadges({ detections }: { detections: ReturnType<typeof incidentSourceDetections> }) {
  const uniqueSources = [...new Set(detections.map((detection) => detection.source))];
  return (
    <div className="flex flex-wrap gap-1">
      {uniqueSources.map((source) => (
        <SourceBadge key={source} source={source} />
      ))}
    </div>
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

function SourceBadge({ source }: { source: IncidentSource }) {
  const styles: Record<IncidentSource, string> = {
    waze: "border-sky-200 bg-sky-50 text-waze",
    google_maps: "border-emerald-200 bg-emerald-50 text-maps",
    fire_dispatch: "border-orange-200 bg-orange-50 text-fire",
    ems: "border-rose-200 bg-rose-50 text-rose-800",
  };
  return (
    <span className={`inline-flex rounded border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${styles[source]}`}>
      {sourceLabel(source)}
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

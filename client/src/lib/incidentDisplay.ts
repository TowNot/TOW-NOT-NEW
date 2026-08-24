import type { Incident, IncidentSource, SourceDetection } from "../types";
import { formatOpenWebNinjaGoogleMapsLabel } from "./googleMapsDisplay";

const SOURCE_LABELS: Record<IncidentSource, string> = {
  waze: "Waze",
  google_maps: "Google Maps",
  fire_dispatch: "Fire dispatch",
  ems: "EMS",
};

export function incidentSourceDetections(incident: Incident): SourceDetection[] {
  if (incident.sourceDetections?.length) return incident.sourceDetections;
  return [
    {
      source: incident.source,
      detectedAt: incident.timestamp,
      provider: incident.provider,
      googleMapsZoom: incident.googleMapsZoom,
    },
  ];
}

export function formatSourceDetectionLabel(detection: SourceDetection): string {
  if (detection.source === "google_maps") {
    return formatOpenWebNinjaGoogleMapsLabel(detection.googleMapsZoom);
  }
  if (detection.provider === "blocksinside") return "BlocksInside · Waze";
  return SOURCE_LABELS[detection.source];
}

export function formatDetectionClock(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Toronto",
  }).format(new Date(iso));
}

export function sourceLabel(source: IncidentSource): string {
  return SOURCE_LABELS[source];
}

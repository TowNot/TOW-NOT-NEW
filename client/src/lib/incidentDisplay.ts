import type { Incident, IncidentSource, SourceDetection } from "../types";
import { fireDispatchDisplayLabel } from "./fireDispatchLabel";
import { formatOpenWebNinjaGoogleMapsLabel } from "./googleMapsDisplay";
import { isPoliceIncident } from "./policeAlerts";

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
      rawType: incident.rawType,
    },
  ];
}

export function formatSourceDetectionLabel(
  detection: SourceDetection,
  incident?: Pick<Incident, "type" | "subtype" | "provider">,
): string {
  if (
    incident &&
    detection.source === "waze" &&
    isPoliceIncident(incident.type, incident.subtype)
  ) {
    return "Waze (Police)";
  }
  if (detection.source === "google_maps") {
    return formatOpenWebNinjaGoogleMapsLabel(detection.googleMapsZoom, detection.rawType);
  }
  if (detection.source === "fire_dispatch") {
    return fireDispatchDisplayLabel(detection.provider ?? incident?.provider);
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

export function sourceLabel(
  source: IncidentSource,
  type?: string | null,
  subtype?: string | null,
  provider?: string | null,
): string {
  if (source === "waze" && isPoliceIncident(type, subtype)) return "Waze (Police)";
  if (source === "fire_dispatch") return fireDispatchDisplayLabel(provider);
  return SOURCE_LABELS[source];
}

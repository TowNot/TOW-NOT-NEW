export type IncidentSource = "waze" | "google_maps" | "fire_dispatch" | "ems";
export type IncidentSeverity = "low" | "medium" | "high" | "critical";

export interface SourceDetection {
  source: IncidentSource;
  detectedAt: string;
  provider?: string;
  googleMapsZoom?: number;
}

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface Incident {
  id: string;
  source: IncidentSource;
  type: string;
  title: string;
  description: string;
  coordinates: GeoPoint;
  locationLabel: string;
  severity: IncidentSeverity;
  timestamp: string;
  expiresAt: string;
  subtype?: string | null;
  provider?: string;
  /** OpenWebNinja zoom level that first returned this Google Maps pin (field test). */
  googleMapsZoom?: number;
  /** Per-source first-seen timestamps when multiple providers confirm the same wreck. */
  sourceDetections?: SourceDetection[];
  unverifiedAddress?: boolean;
  audioUrl?: string;
  notified?: boolean;
}

export interface PushReceipt {
  id: string;
  channel: "test" | "dispatch";
  payload: {
    title: string;
    body: string;
    severity?: IncidentSeverity;
    incidentId?: string;
  };
  sentAt: string;
}

export interface HealthStatus {
  status: string;
  service: string;
  uptime: number;
  timestamp: string;
}

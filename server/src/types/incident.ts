export type IncidentSource = "waze" | "google_maps" | "fire_dispatch" | "ems";

export type IncidentSeverity = "low" | "medium" | "high" | "critical";

export interface SourceDetection {
  source: IncidentSource;
  detectedAt: string;
  provider?: string;
  googleMapsZoom?: number;
  /** Raw OpenWebNinja alert type (accident, incident, etc.). */
  rawType?: string;
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
  /** Latest merge or refresh — desk feed sorts by this when set. */
  lastReportedAt?: string;
  expiresAt: string;
  subtype?: string | null;
  provider?: string;
  /** OpenWebNinja zoom level that first returned this Google Maps pin (field test). */
  googleMapsZoom?: number;
  /** Raw OpenWebNinja `type` string before we classify it (field test). */
  rawType?: string;
  /** Waze / Google Maps reporter username when the API provides one. */
  reporterName?: string;
  /** Per-source first-seen timestamps when multiple providers confirm the same wreck. */
  sourceDetections?: SourceDetection[];
  unverifiedAddress?: boolean;
  /** Fire-dispatch clip for manual address verification. */
  audioUrl?: string;
  /** False for major hazards, which are mapped and listed but never pushed. */
  notified?: boolean;
}

export interface PushPayload {
  title: string;
  body: string;
  severity?: IncidentSeverity;
  incidentId?: string;
  url?: string;
  /** When set, Progressier targets only devices tagged `zone-<id>`. */
  zoneId?: string;
  /** Opt-in police audience uses `zone-<id>-waze-police` instead of the zone tag. */
  audience?: "zone" | "zone_police";
  /** Optional Waze / Google Maps reporter for clients that read push data. */
  reporterName?: string;
}

export interface PushReceipt {
  id: string;
  channel: "test" | "dispatch";
  payload: PushPayload;
  sentAt: string;
}

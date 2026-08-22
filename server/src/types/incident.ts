export type IncidentSource = "waze" | "google_maps" | "fire_dispatch";

export type IncidentSeverity = "low" | "medium" | "high" | "critical";

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
}

export interface PushReceipt {
  id: string;
  channel: "test" | "dispatch";
  payload: PushPayload;
  sentAt: string;
}

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

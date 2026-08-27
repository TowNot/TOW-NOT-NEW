import type { Incident } from "../types";

/** Latest SSE snapshot for push-bridge lookup (client-only, not persisted). */
let byId = new Map<string, Incident>();

export function syncIncidentRegistry(incidents: Incident[]): void {
  byId = new Map(incidents.map((incident) => [incident.id, incident]));
}

export function getIncidentById(id: string): Incident | undefined {
  return byId.get(id);
}

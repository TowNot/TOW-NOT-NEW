import { config } from "./config";
import { zoneIdForCoordinates, zonePushTag } from "./engine/coverageZones";
import { formatOpenWebNinjaGoogleMapsLabel } from "./engine/googleMaps/googleMapsDisplay";
import { getCoverageZone } from "./engine/zones.config";
import { logger } from "./logger";
import type { Incident, PushPayload } from "./types/incident";

// Progressier API caps: title 50 chars, body 100 chars.
const TITLE_MAX = 50;
const BODY_MAX = 100;

/**
 * Broadcast to every Progressier-subscribed device. Used only for test /
 * unscoped admin pushes. Live incidents always target a single city tag.
 */
export const PROGRESSIER_RECIPIENTS = { users: "all" } as const;

export interface ProgressierPushRequest {
  recipients: Record<string, string>;
  title: string;
  body: string;
  message: string;
  url: string;
  icon: string;
  data: { url: string };
}

const SOURCE_LABELS: Record<Incident["source"], string> = {
  waze: "Waze",
  google_maps: "Google Maps",
  fire_dispatch: "Fire dispatch",
  ems: "EMS",
};

function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const origin = config.publicUrl.replace(/\/$/, "");
  return `${origin}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

const PROVIDER_LABELS: Record<string, string> = {
  blocksinside: "BlocksInside",
  waze_direct: "Waze Direct",
  openwebninja: "OpenWebNinja",
  openwebninja_google_maps: "Google Maps",
  google_maps: "Google Maps",
  london_fire_dispatch: "Fire dispatch",
};

function labelForIncident(incident: Incident): string {
  if (incident.provider === "openwebninja_google_maps") {
    return formatOpenWebNinjaGoogleMapsLabel(incident.googleMapsZoom, incident.rawType);
  }
  if (incident.provider) {
    const known = PROVIDER_LABELS[incident.provider];
    if (known) return known;
    const fireM = incident.provider.match(/^([a-zA-Z]+)_fire_dispatch(?:_(hls|stream))?$/);
    if (fireM) {
      const zone = getCoverageZone(fireM[1]);
      return zone ? `Fire dispatch · ${zone.name}` : "Fire dispatch";
    }
    const emsM = incident.provider.match(/^([a-zA-Z]+)_ems$/);
    if (emsM) {
      const zone = getCoverageZone(emsM[1]);
      return zone ? `EMS · ${zone.name}` : "EMS";
    }
    return incident.provider;
  }
  return SOURCE_LABELS[incident.source];
}

export function resolvePushDestination(payload: PushPayload): string {
  if (payload.url?.trim()) return absoluteUrl(payload.url.trim());
  return absoluteUrl("/desk");
}

/** Single-city recipients — only devices tagged for this zone. */
export function recipientsForIncidentZone(zoneId: string): Record<string, string> {
  return { tags: zonePushTag(zoneId) };
}

export function buildProgressierPayload(
  payload: PushPayload,
  recipients: Record<string, string> = { ...PROGRESSIER_RECIPIENTS },
): ProgressierPushRequest {
  const body = truncate(payload.body, BODY_MAX);
  const url = resolvePushDestination(payload);
  return {
    recipients,
    title: truncate(payload.title, TITLE_MAX),
    body,
    message: body,
    url,
    icon: config.pushIconUrl,
    data: { url },
  };
}

export function resolveIncidentZoneId(incident: Incident): string | null {
  if (incident.source === "fire_dispatch" || incident.source === "ems") {
    const m = incident.provider?.match(/^([a-zA-Z]+)_(?:fire_dispatch(?:_(?:hls|stream))?|ems)$/);
    if (m) return m[1];
  }
  return zoneIdForCoordinates(
    incident.coordinates.latitude,
    incident.coordinates.longitude,
  );
}

export function incidentToPushPayload(incident: Incident): PushPayload {
  const providerLabel = labelForIncident(incident);
  const zoneId = resolveIncidentZoneId(incident);
  return {
    title: `AlertNav · ${providerLabel} · ${incident.title}`,
    body: `${incident.locationLabel} — caught by ${providerLabel}`,
    severity: incident.severity,
    incidentId: incident.id,
    url: `/desk?incident=${encodeURIComponent(incident.id)}`,
    zoneId: zoneId ?? undefined,
  };
}

async function postProgressier(
  apiKey: string,
  body: ProgressierPushRequest,
  incidentId: string | undefined,
): Promise<void> {
  logger.info("Sending Progressier push", {
    title: body.title,
    incidentId,
    endpoint: config.progressierPushUrl,
    recipients: body.recipients,
    url: body.url,
    hasIcon: Boolean(body.icon),
  });

  const response = await fetch(config.progressierPushUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const detail = await response.text().catch(() => "");
  let parsed: Record<string, unknown> | null = null;
  if (detail) {
    try {
      parsed = JSON.parse(detail) as unknown as Record<string, unknown>;
    } catch {
      parsed = null;
    }
  }

  logger.info("Progressier push response", {
    status: response.status,
    ok: response.ok,
    recipients: body.recipients,
    body: detail.slice(0, 500),
  });

  if (!response.ok) {
    throw new Error(
      `Progressier push failed (${response.status}) at ${config.progressierPushUrl}: ${detail || response.statusText}`,
    );
  }

  const gatewayError = parsed && parsed["error"];
  if (parsed && (parsed["success"] === false || typeof gatewayError === "string")) {
    throw new Error(
      `Progressier push rejected at ${config.progressierPushUrl}: ${String(gatewayError ?? "unknown error")}`,
    );
  }
}

/**
 * Strict single-city Progressier send. Live incidents target only `zone-<id>`.
 * Incidents outside known boxes are skipped. Test pushes still broadcast.
 */
export async function sendProgressierPush(payload: PushPayload): Promise<void> {
  const apiKey = (process.env.PROGRESSIER_API_KEY ?? config.progressierApiKey).trim();
  if (!apiKey) {
    throw new Error("PROGRESSIER_API_KEY is not configured");
  }

  const zoneId = payload.zoneId?.trim();
  if (payload.incidentId && !zoneId) {
    logger.info("Skipping push — incident outside any single coverage zone", {
      incidentId: payload.incidentId,
    });
    return;
  }

  const recipients = zoneId
    ? recipientsForIncidentZone(zoneId)
    : { ...PROGRESSIER_RECIPIENTS };

  await postProgressier(apiKey, buildProgressierPayload(payload, recipients), payload.incidentId);
}

function truncate(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

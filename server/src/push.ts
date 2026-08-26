import { config } from "./config";
import { zoneIdForCoordinates, zonePolicePushTag, zonePushTag } from "./engine/coverageZones";
import { fireDispatchDisplayLabel } from "./engine/fireDispatchLabel";
import { formatOpenWebNinjaGoogleMapsLabel } from "./engine/googleMaps/googleMapsDisplay";
import {
  isTorontoFireCadProvider,
  TORONTO_FIRE_CAD_PROVIDER,
  zoneIdFromTorontoFireCadProvider,
} from "./engine/pollers/torontoFireCadPoller";
import { torontoZoneIdForCoordinates } from "./engine/torontoFire/zoneAssign";
import { getCoverageZone } from "./engine/zones.config";
import { isPoliceType } from "./engine/wazeAggregator";
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
  [TORONTO_FIRE_CAD_PROVIDER]: "Toronto Fire",
};

function labelForIncident(incident: Incident): string {
  if (isPoliceType(incident.type, incident.subtype ?? null)) {
    return "Waze (Police)";
  }
  if (incident.provider === TORONTO_FIRE_CAD_PROVIDER || isTorontoFireCadProvider(incident.provider)) {
    return "Toronto Fire";
  }
  if (incident.provider === "openwebninja_google_maps") {
    return formatOpenWebNinjaGoogleMapsLabel(incident.googleMapsZoom, incident.rawType);
  }
  if (incident.source === "fire_dispatch") {
    return fireDispatchDisplayLabel(incident.provider ?? resolveIncidentZoneId(incident));
  }
  if (incident.provider) {
    const known = PROVIDER_LABELS[incident.provider];
    if (known) return known;
    const fireM = incident.provider.match(
      /^([a-zA-Z]+)_fire_dispatch(?:_(?:hls|stream|dg|aai|sm))?$/,
    );
    if (fireM) {
      return fireDispatchDisplayLabel(fireM[1]);
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

/** Single-city recipients — only devices tagged for this zone (or police opt-in). */
export function recipientsForIncidentZone(
  zoneId: string,
  audience: PushPayload["audience"] = "zone",
): Record<string, string> {
  if (audience === "zone_police") {
    return { tags: zonePolicePushTag(zoneId) };
  }
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
  // Toronto Fire CAD: always tag to torontoCore / scarborough / northYork /
  // etobicoke — even when those zones are not yet enabled for Waze polling.
  if (isTorontoFireCadProvider(incident.provider)) {
    return (
      zoneIdFromTorontoFireCadProvider(incident.provider) ??
      torontoZoneIdForCoordinates(
        incident.coordinates.latitude,
        incident.coordinates.longitude,
      )
    );
  }
  if (incident.source === "fire_dispatch" || incident.source === "ems") {
    const m = incident.provider?.match(
      /^([a-zA-Z]+)_(?:fire_dispatch(?:_(?:hls|stream|dg|aai|sm))?|ems)$/,
    );
    if (m) return m[1];
  }
  return zoneIdForCoordinates(
    incident.coordinates.latitude,
    incident.coordinates.longitude,
  );
}

export function incidentToPushPayload(incident: Incident): PushPayload {
  const police = isPoliceType(incident.type, incident.subtype ?? null);
  const providerLabel = labelForIncident(incident);
  const zoneId = resolveIncidentZoneId(incident);
  const note = incident.description?.trim();
  // STT bake-off: keep [DG]/[AAI]/[SM] at the front of the Progressier title
  // so the 50-char cap doesn't strip the engine tag.
  const bakeOffTitle = /^\[(DG|AAI|SM)\]/.test(incident.title);
  return {
    title: police
      ? "AlertNav · Waze (Police)"
      : bakeOffTitle
        ? truncate(incident.title, TITLE_MAX)
        : `AlertNav · ${providerLabel} · ${incident.title}`,
    body: police
      ? truncate(
          [incident.locationLabel, note && note !== incident.locationLabel ? note : null]
            .filter(Boolean)
            .join(" — ") || incident.locationLabel,
          BODY_MAX,
        )
      : `${incident.locationLabel} — caught by ${providerLabel}`,
    severity: incident.severity,
    incidentId: incident.id,
    url: `/desk?incident=${encodeURIComponent(incident.id)}`,
    zoneId: zoneId ?? undefined,
    audience: police ? "zone_police" : "zone",
  };
}

async function postProgressier(
  apiKey: string,
  body: ProgressierPushRequest,
  incidentId: string | undefined,
): Promise<void> {
  logger.debug("Sending Progressier push", {
    title: body.title,
    incidentId,
    endpoint: config.progressierPushUrl,
    recipients: body.recipients,
    url: body.url,
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

  if (!response.ok) {
    logger.error("Progressier push failed", {
      status: response.status,
      incidentId,
      body: detail.slice(0, 500),
    });
    throw new Error(
      `Progressier push failed (${response.status}) at ${config.progressierPushUrl}: ${detail || response.statusText}`,
    );
  }

  const gatewayError = parsed && parsed["error"];
  if (parsed && (parsed["success"] === false || typeof gatewayError === "string")) {
    logger.error("Progressier push rejected", {
      status: response.status,
      incidentId,
      error: String(gatewayError ?? "unknown error"),
    });
    throw new Error(
      `Progressier push rejected at ${config.progressierPushUrl}: ${String(gatewayError ?? "unknown error")}`,
    );
  }

  logger.info(
    `[Progressier] Pushed alert for ${incidentId ?? "unknown"} | status: ${response.status}`,
  );
}

/**
 * Strict single-city Progressier send.
 * Accidents → only `zone-<id>` (one send even if device also has police tag).
 * Police → only `zone-<id>-waze-police` (never also zone tag — no double-send).
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
    ? recipientsForIncidentZone(zoneId, payload.audience ?? "zone")
    : { ...PROGRESSIER_RECIPIENTS };

  await postProgressier(apiKey, buildProgressierPayload(payload, recipients), payload.incidentId);
}

function truncate(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

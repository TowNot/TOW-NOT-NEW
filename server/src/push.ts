import { config } from "./config";
import {
  zoneIdForCoordinates,
  zonePushTag,
  ZONE_ALL_PUSH_TAG,
} from "./engine/coverageZones";
import { logger } from "./logger";
import type { Incident, PushPayload } from "./types/incident";

// Progressier API caps: title 50 chars, body 100 chars.
const TITLE_MAX = 50;
const BODY_MAX = 100;

/**
 * Broadcast to every Progressier-subscribed device. Tag targeting
 * (`{ tags: "tow-not" }`) returns HTTP 200 with a yellow check when no
 * device has that tag — the API "succeeds" and nothing is delivered.
 * Prefer zone tags for live incident pushes.
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
  if (incident.provider) {
    return PROVIDER_LABELS[incident.provider] ?? incident.provider;
  }
  return SOURCE_LABELS[incident.source];
}

export function resolvePushDestination(payload: PushPayload): string {
  if (payload.url?.trim()) return absoluteUrl(payload.url.trim());
  return absoluteUrl("/desk");
}

/** Recipients for a zone-scoped incident: current-city subscribers + all-cities. */
export function recipientsForIncidentZone(zoneId: string): Record<string, string>[] {
  return [{ tags: zonePushTag(zoneId) }, { tags: ZONE_ALL_PUSH_TAG }];
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
  if (incident.source === "fire_dispatch") return "london";
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
 * Zone-aware Progressier send. Live incidents target `zone-<id>` (Only Current City)
 * and `zone-all` (All Enabled Cities). Test / unscoped payloads still broadcast to all.
 */
export async function sendProgressierPush(payload: PushPayload): Promise<void> {
  const apiKey = (process.env.PROGRESSIER_API_KEY ?? config.progressierApiKey).trim();
  if (!apiKey) {
    throw new Error("PROGRESSIER_API_KEY is not configured");
  }

  const recipientSets = (() => {
    const zoneId = payload.zoneId?.trim();
    if (zoneId) return recipientsForIncidentZone(zoneId);
    // Live incident outside known boxes: only "All Enabled Cities" subscribers.
    if (payload.incidentId) return [{ tags: ZONE_ALL_PUSH_TAG }];
    // Test / unscoped admin pushes still broadcast.
    return [{ ...PROGRESSIER_RECIPIENTS }];
  })();

  const results = await Promise.allSettled(
    recipientSets.map((recipients) =>
      postProgressier(apiKey, buildProgressierPayload(payload, recipients), payload.incidentId),
    ),
  );

  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length === results.length) {
    const first = failures[0] as PromiseRejectedResult;
    throw first.reason instanceof Error
      ? first.reason
      : new Error(String(first.reason));
  }
  if (failures.length > 0) {
    logger.warn("Partial Progressier zone push failure", {
      incidentId: payload.incidentId,
      zoneId: payload.zoneId,
      failed: failures.length,
      total: results.length,
    });
  }
}

function truncate(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

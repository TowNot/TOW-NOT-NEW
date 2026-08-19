import { config } from "./config";
import { logger } from "./logger";
import type { Incident, PushPayload } from "./types/incident";

const TITLE_MAX = 50;
const BODY_MAX = 100;

/**
 * Broadcast to every Progressier-subscribed device. Tag targeting
 * (`{ tags: "tow-not" }`) returns HTTP 200 with a yellow check when no
 * device has that tag — the API "succeeds" and nothing is delivered.
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
  cavsn: "CAVSN",
  waze_direct: "Waze Direct",
  openwebninja: "OpenWebNinja",
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

export function buildProgressierPayload(payload: PushPayload): ProgressierPushRequest {
  const body = truncate(payload.body, BODY_MAX);
  const url = resolvePushDestination(payload);
  return {
    recipients: { ...PROGRESSIER_RECIPIENTS },
    title: truncate(payload.title, TITLE_MAX),
    body,
    message: body,
    url,
    icon: config.pushIconUrl,
    data: { url },
  };
}

export function incidentToPushPayload(incident: Incident): PushPayload {
  const providerLabel = labelForIncident(incident);
  return {
    title: `AlertNav · ${providerLabel} · ${incident.title}`,
    body: `${incident.locationLabel} — caught by ${providerLabel}`,
    severity: incident.severity,
    incidentId: incident.id,
    url: `/desk?incident=${encodeURIComponent(incident.id)}`,
  };
}

export async function sendProgressierPush(payload: PushPayload): Promise<void> {
  const apiKey = (process.env.PROGRESSIER_API_KEY ?? config.progressierApiKey).trim();
  if (!apiKey) {
    throw new Error("PROGRESSIER_API_KEY is not configured");
  }

  const body = buildProgressierPayload(payload);
  logger.info("Sending Progressier push", {
    title: body.title,
    incidentId: payload.incidentId,
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
      parsed = JSON.parse(detail) as Record<string, unknown>;
    } catch {
      parsed = null;
    }
  }

  logger.info("Progressier push response", {
    status: response.status,
    ok: response.ok,
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

function truncate(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

import { config } from "./config";
import { logger } from "./logger";
import type { Incident, PushPayload } from "./types/incident";

const TITLE_MAX = 50;
const BODY_MAX = 100;

export interface ProgressierPushRequest {
  recipients: Record<string, string>;
  title: string;
  body: string;
  url: string;
  icon?: string;
}

const SOURCE_LABELS: Record<Incident["source"], string> = {
  waze: "Waze",
  google_maps: "Google Maps",
  fire_dispatch: "Fire dispatch",
};

export function buildProgressierPayload(payload: PushPayload): ProgressierPushRequest {
  return {
    recipients: { tags: "tow-not" },
    title: truncate(payload.title, TITLE_MAX),
    body: truncate(payload.body, BODY_MAX),
    url: payload.url ?? config.clientOrigin,
    ...(config.pushIconUrl ? { icon: config.pushIconUrl } : {}),
  };
}

export function incidentToPushPayload(incident: Incident): PushPayload {
  return {
    title: `TowNot 2 · ${incident.title}`,
    body: `${incident.locationLabel} — ${SOURCE_LABELS[incident.source]}`,
    severity: incident.severity,
    incidentId: incident.id,
    url: `${config.clientOrigin}/?incident=${encodeURIComponent(incident.id)}`,
  };
}

export async function sendProgressierPush(payload: PushPayload): Promise<void> {
  const apiKey = process.env.PROGRESSIER_API_KEY ?? config.progressierApiKey;
  if (!apiKey) {
    throw new Error("PROGRESSIER_API_KEY is not configured");
  }

  const body = buildProgressierPayload(payload);
  logger.info("Sending Progressier push", {
    title: body.title,
    incidentId: payload.incidentId,
    endpoint: config.progressierPushUrl,
  });

  const response = await fetch(config.progressierPushUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Progressier push failed (${response.status}) at ${config.progressierPushUrl}: ${detail || response.statusText}`,
    );
  }
}

function truncate(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

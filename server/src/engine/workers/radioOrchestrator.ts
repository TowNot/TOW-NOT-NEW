import { config } from "../../config";
import { logger } from "../../logger";
import { IncidentStore } from "../../store/incidentStore";
import { isIngestZoneAllowed } from "../londonOnly";
import { WATERLOO_REGION_RADIO_FEEDS } from "../waterlooRegionRadio";
import { COVERAGE_ZONES } from "../zones.config";
import { attachFireDispatchStore } from "./fireDispatchPipeline";
import { startHlsFireListener } from "./hlsFireListener";
import { startIcecastFireListener } from "./icecastFireListener";

const stopFns: Array<() => void> = [];

function streamKey(audio: { type: string; feedId?: number | null; url?: string }): string {
  if (audio.type === "hls" && typeof audio.feedId === "number") {
    return `hls:${audio.feedId}`;
  }
  if (audio.type === "stream" && audio.url) {
    return `stream:${audio.url}`;
  }
  return `${audio.type}:unknown`;
}

/** Zones allowed for Deepgram / radio (config allowlist ∩ optional caller filter). */
function resolveFireZoneAllowlist(
  allowedZoneIds?: ReadonlySet<string>,
): ReadonlySet<string> {
  const configured = new Set(config.fireDispatchZoneIds);
  if (!allowedZoneIds) return configured;
  const intersection = new Set<string>();
  for (const id of allowedZoneIds) {
    if (configured.has(id)) intersection.add(id);
  }
  return intersection;
}

export function startRadioOrchestrator(
  store: IncidentStore,
  allowedZoneIds?: ReadonlySet<string>,
): void {
  if (!config.fireDispatchEnabled) {
    logger.info("[FIRE SCANNER] orchestrator not started — FIRE_DISPATCH_ENABLED is off");
    return;
  }
  attachFireDispatchStore(store);

  const fireZones = resolveFireZoneAllowlist(allowedZoneIds);
  const startedStreams = new Set<string>();
  const active: string[] = [];
  const skippedInactive: string[] = [];

  for (const zone of COVERAGE_ZONES) {
    if (!fireZones.has(zone.id)) {
      skippedInactive.push(`${zone.id}(not-in-FIRE_DISPATCH_ZONES)`);
      continue;
    }
    if (!zone.enabled || !zone.audio?.enabled) {
      if (zone.audio?.type === "stream" && zone.audio.url) {
        skippedInactive.push(`${zone.id}:stream(disabled)`);
      }
      continue;
    }
    if (!isIngestZoneAllowed(zone.id)) continue;

    if (zone.audio.type === "hls" && zone.audio.feedId == null) {
      logger.debug(
        `[fire-dispatch] skipping ${zone.id} — HLS feedId not assigned yet`,
      );
      continue;
    }

    if (zone.audio.type === "stream" && !zone.audio.url.trim()) {
      logger.debug(`[fire-dispatch] skipping ${zone.id} — stream URL empty`);
      continue;
    }

    const key = streamKey(zone.audio);
    if (startedStreams.has(key)) {
      logger.info(
        `[fire-dispatch] skipping duplicate audio for zone ${zone.id} — already listening on ${key}`,
      );
      continue;
    }
    startedStreams.add(key);

    if (zone.audio.type === "hls" && typeof zone.audio.feedId === "number") {
      stopFns.push(
        startHlsFireListener({
          zoneId: zone.id,
          feedId: zone.audio.feedId,
          description: zone.audio.description,
        }),
      );
      active.push(`${zone.id}:hls:${zone.audio.feedId}`);
      continue;
    }

    if (zone.audio.type === "stream") {
      stopFns.push(
        startIcecastFireListener({
          zoneId: zone.id,
          url: zone.audio.url,
          description: zone.audio.description,
          agency: zone.audio.agency,
          keywordTriggers: zone.audio.keywordTriggers,
        }),
      );
      active.push(`${zone.id}:stream`);
    }
  }

  for (const feed of WATERLOO_REGION_RADIO_FEEDS) {
    if (!fireZones.has(feed.zoneId)) {
      skippedInactive.push(`${feed.id}(not-in-FIRE_DISPATCH_ZONES)`);
      continue;
    }
    if (!feed.enabled) {
      skippedInactive.push(`${feed.id}(disabled)`);
      continue;
    }
    if (!isIngestZoneAllowed(feed.zoneId)) {
      skippedInactive.push(`${feed.id}(london-only-lock)`);
      continue;
    }
    if (!feed.url.trim()) {
      logger.warn(
        `[fire-dispatch] ${feed.id} enabled but URL empty — CYKF has not published a live mount`,
      );
      continue;
    }
    const key = `stream:${feed.url}`;
    if (startedStreams.has(key)) {
      logger.info(
        `[fire-dispatch] skipping duplicate Waterloo feed ${feed.id} — already listening on ${key}`,
      );
      continue;
    }
    startedStreams.add(key);
    stopFns.push(
      startIcecastFireListener({
        zoneId: feed.zoneId,
        url: feed.url,
        description: feed.description,
        agency: feed.agency,
        keywordTriggers: feed.keywordTriggers,
      }),
    );
    active.push(`${feed.id}:stream`);
  }

  const skippedInactiveCount = skippedInactive.length;
  logger.info("[fire-dispatch] radio orchestrator started", {
    sources: active,
    fireDispatchZones: [...fireZones].sort(),
    skippedInactive: `skipped ${skippedInactiveCount} inactive region${skippedInactiveCount === 1 ? "" : "s"}`,
  });
  if (skippedInactiveCount > 0) {
    logger.debug("[fire-dispatch] inactive regions detail", { skippedInactive });
  }
}

export function stopRadioOrchestrator(): void {
  for (const stop of stopFns) stop();
  stopFns.length = 0;
}

export async function reconcileRadioOrchestrator(
  store: IncidentStore,
): Promise<void> {
  if (!config.fireDispatchEnabled) {
    stopRadioOrchestrator();
    return;
  }
  // Deepgram spend is gated by FIRE_DISPATCH_ZONES (default: london only),
  // not by which cities users selected for Waze/GMaps.
  stopRadioOrchestrator();
  startRadioOrchestrator(store, new Set(config.fireDispatchZoneIds));
}

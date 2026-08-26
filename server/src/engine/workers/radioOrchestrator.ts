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

export function startRadioOrchestrator(store: IncidentStore): void {
  attachFireDispatchStore(store);

  const startedStreams = new Set<string>();
  const active: string[] = [];
  const skippedInactive: string[] = [];

  for (const zone of COVERAGE_ZONES) {
    // zone.enabled + audio.enabled; London-only lock also applied via enabledCoverageZones
    // for Waze/GMaps — radio uses the same enabled flags here.
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

  // Dedicated Waterloo Region Fire + EMS mounts (kept off during London-only).
  for (const feed of WATERLOO_REGION_RADIO_FEEDS) {
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

  logger.info("[fire-dispatch] radio orchestrator started", {
    sources: active,
    skippedInactive,
  });
}

export function stopRadioOrchestrator(): void {
  for (const stop of stopFns) stop();
  stopFns.length = 0;
}

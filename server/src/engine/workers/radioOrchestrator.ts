import { logger } from "../../logger";
import { IncidentStore } from "../../store/incidentStore";
import { COVERAGE_ZONES } from "../zones.config";
import { attachFireDispatchStore } from "./fireDispatchPipeline";
import { startHlsFireListener } from "./hlsFireListener";
import { startIcecastFireListener } from "./icecastFireListener";

const stopFns: Array<() => void> = [];

function streamKey(audio: { type: string; feedId?: number; url?: string }): string {
  if (audio.type === "hls" && typeof audio.feedId === "number") {
    return `hls:${audio.feedId}`;
  }
  if (audio.type === "icecast" && audio.url) {
    return `icecast:${audio.url}`;
  }
  return `${audio.type}:unknown`;
}

export function startRadioOrchestrator(store: IncidentStore): void {
  attachFireDispatchStore(store);

  const startedStreams = new Set<string>();
  const active: string[] = [];

  for (const zone of COVERAGE_ZONES) {
    if (!zone.enabled || !zone.audio?.enabled) continue;

    const key = streamKey(zone.audio);
    if (startedStreams.has(key)) {
      logger.info(
        `[fire-dispatch] skipping duplicate audio for zone ${zone.id} — already listening on ${key}`,
      );
      continue;
    }
    startedStreams.add(key);

    if (zone.audio.type === "hls") {
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

    if (zone.audio.type === "icecast") {
      stopFns.push(
        startIcecastFireListener({
          zoneId: zone.id,
          url: zone.audio.url,
          description: zone.audio.description,
        }),
      );
      active.push(`${zone.id}:icecast`);
    }
  }

  logger.info("[fire-dispatch] radio orchestrator started", { sources: active });
}

export function stopRadioOrchestrator(): void {
  for (const stop of stopFns) stop();
  stopFns.length = 0;
}

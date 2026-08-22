import { logger } from "../../logger";
import { IncidentStore } from "../../store/incidentStore";
import { COVERAGE_ZONES } from "../zones.config";
import { startCallsListener } from "./callsListener";
import { attachFireDispatchStore } from "./fireDispatchPipeline";
import { startZoneStreamListener } from "./fireStreamListener";

const stopFns: Array<() => void> = [];

export function startRadioOrchestrator(store: IncidentStore): void {
  attachFireDispatchStore(store);

  for (const zone of COVERAGE_ZONES) {
    if (!zone.enabled) continue;

    for (const source of zone.audioSources) {
      if (!source.enabled) continue;

      if (source.type === "stream") {
        stopFns.push(startZoneStreamListener(zone.id, source));
        continue;
      }

      if (source.type === "calls") {
        stopFns.push(startCallsListener(zone.id, source));
      }
    }
  }

  const active = COVERAGE_ZONES.filter((z) => z.enabled).flatMap((z) =>
    z.audioSources.filter((s) => s.enabled).map((s) => `${z.id}:${s.type}:${s.description}`),
  );
  logger.info("[fire-dispatch] radio orchestrator started", { sources: active });
}

export function stopRadioOrchestrator(): void {
  for (const stop of stopFns) stop();
  stopFns.length = 0;
}

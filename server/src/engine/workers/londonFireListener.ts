/**
 * @deprecated Legacy London-only listener.
 * Audio ingestion now runs through `radioOrchestrator` → `hlsFireListener` /
 * `icecastFireListener`. This module re-exports shared helpers for older scripts.
 */
export {
  createAudioBufferState,
  pushSegment,
  readyToFlush,
  shedOldestSegments,
  takeFlushChunk,
  BUFFER_TARGET_SECONDS,
} from "./audioBuffer";

export { getFireDispatchRuntime } from "./fireDispatchRuntime";
export type { FireDispatchRuntimeStats } from "./fireDispatchRuntime";

/** No-op — use startRadioOrchestrator via RadioIngestionWorker. */
export function attachFireIncidentStore(_store: unknown): void {
  // Store attachment is handled by the radio orchestrator.
}

/** No-op — London fire now starts via the HLS orchestrator. */
export function startLondonFireListener(): void {
  // Intentionally empty: RadioIngestionWorker uses startRadioOrchestrator.
}

export function stopLondonFireListener(): void {
  // Intentionally empty.
}

export function isFireListenerRunning(): boolean {
  return false;
}

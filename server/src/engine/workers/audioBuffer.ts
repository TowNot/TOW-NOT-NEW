/**
 * Shared MPEG-TS segment buffer helpers for HLS fire-dispatch listeners.
 * Rolling overlap keeps dispatch phrases that straddle chunk boundaries intact.
 */

export const BUFFER_TARGET_SECONDS = 10;
export const MAX_BUFFERED_SEGMENTS = 12;
export const OVERLAP_TARGET_SECONDS = 4;

export interface AudioBufferState {
  pending: Buffer[];
  pendingSegSeconds: number[];
  pendingSeconds: number;
  overlapSeconds: number;
  overlapSegments: number;
}

export function createAudioBufferState(): AudioBufferState {
  return {
    pending: [],
    pendingSegSeconds: [],
    pendingSeconds: 0,
    overlapSeconds: 0,
    overlapSegments: 0,
  };
}

export function resetAudioBuffer(state: AudioBufferState): void {
  state.pending = [];
  state.pendingSegSeconds = [];
  state.pendingSeconds = 0;
  state.overlapSeconds = 0;
  state.overlapSegments = 0;
}

export function pushSegment(state: AudioBufferState, data: Buffer, seconds: number): void {
  state.pending.push(data);
  state.pendingSegSeconds.push(seconds);
  state.pendingSeconds += seconds;
}

export function readyToFlush(state: AudioBufferState): boolean {
  const freshSeconds = state.pendingSeconds - state.overlapSeconds;
  const freshSegments = state.pending.length - state.overlapSegments;
  return freshSeconds >= BUFFER_TARGET_SECONDS || freshSegments >= MAX_BUFFERED_SEGMENTS;
}

export function takeFlushChunk(state: AudioBufferState): Buffer[] {
  const chunk = state.pending;
  const chunkSeconds = state.pendingSegSeconds;

  const carrySegments: Buffer[] = [];
  const carrySeconds: number[] = [];
  let carried = 0;
  for (let i = chunk.length - 1; i > 0 && carried < OVERLAP_TARGET_SECONDS; i--) {
    const segment = chunk[i];
    if (!segment) continue;
    carrySegments.unshift(segment);
    const duration = chunkSeconds[i] ?? 0;
    carrySeconds.unshift(duration);
    carried += duration;
  }

  state.pending = carrySegments;
  state.pendingSegSeconds = carrySeconds;
  state.pendingSeconds = carried;
  state.overlapSeconds = carried;
  state.overlapSegments = carrySegments.length;

  return chunk;
}

export function shedOldestSegments(state: AudioBufferState): number {
  const dropped = state.pending.length - MAX_BUFFERED_SEGMENTS;
  state.pending = state.pending.slice(-MAX_BUFFERED_SEGMENTS);
  state.pendingSegSeconds = state.pendingSegSeconds.slice(-MAX_BUFFERED_SEGMENTS);
  state.pendingSeconds = state.pendingSegSeconds.reduce((sum, s) => sum + s, 0);
  state.overlapSeconds = 0;
  state.overlapSegments = 0;
  return dropped;
}

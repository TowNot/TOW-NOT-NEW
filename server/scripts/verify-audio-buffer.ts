import assert from "node:assert/strict";
import {
  createAudioBufferState,
  pushSegment,
  readyToFlush,
  shedOldestSegments,
  takeFlushChunk,
} from "../src/engine/workers/londonFireListener";

const SEGMENT_SECONDS = 4.023; // Broadcastify feed 34296 segment length
const BUFFER_TARGET_SECONDS = 15;
const OVERLAP_TARGET_SECONDS = 4;

const state = createAudioBufferState();
const flushes: Array<{ total: number; carriedIn: number }> = [];
let sequence = 0;
let carriedIn = 0;

// 20 polls of one segment each: enough to cover several flush cycles.
for (let i = 0; i < 20; i++) {
  pushSegment(state, Buffer.from(`segment-${sequence++}`), SEGMENT_SECONDS);
  if (!readyToFlush(state)) continue;

  const overlapBefore = state.overlapSeconds;
  const chunk = takeFlushChunk(state);
  const total = chunk.length * SEGMENT_SECONDS;
  flushes.push({ total, carriedIn: overlapBefore });
  carriedIn = state.overlapSeconds;

  assert.ok(
    total - overlapBefore >= BUFFER_TARGET_SECONDS,
    `flush carried only ${(total - overlapBefore).toFixed(2)}s of new audio`,
  );
  assert.ok(chunk.length > state.pending.length, "overlap must not carry the whole buffer");
}

assert.ok(flushes.length >= 3, `expected multiple flushes, saw ${flushes.length}`);
for (const flush of flushes.slice(1)) {
  assert.ok(
    flush.carriedIn >= OVERLAP_TARGET_SECONDS,
    `flush replayed only ${flush.carriedIn.toFixed(2)}s of overlap`,
  );
}
console.error(
  `PASS  ${flushes.length} flushes, each ≥${BUFFER_TARGET_SECONDS}s new audio; overlap carried ${carriedIn.toFixed(2)}s`,
);

// A single-segment buffer must advance rather than replaying itself forever.
const tiny = createAudioBufferState();
pushSegment(tiny, Buffer.from("only"), 20);
assert.equal(readyToFlush(tiny), true);
assert.equal(takeFlushChunk(tiny).length, 1);
assert.equal(tiny.pending.length, 0);
console.error("PASS  single-segment buffer flushes without replaying itself");

// Shedding a stalled backlog clears the replay bookkeeping too.
const stalled = createAudioBufferState();
for (let i = 0; i < 40; i++) pushSegment(stalled, Buffer.from(`x${i}`), SEGMENT_SECONDS);
stalled.overlapSeconds = SEGMENT_SECONDS;
stalled.overlapSegments = 1;
const dropped = shedOldestSegments(stalled);
assert.equal(dropped, 28);
assert.equal(stalled.pending.length, 12);
assert.equal(stalled.pendingSegSeconds.length, 12);
assert.equal(stalled.overlapSeconds, 0);
assert.ok(Math.abs(stalled.pendingSeconds - 12 * SEGMENT_SECONDS) < 1e-9);
console.error("PASS  backlog shed keeps segment durations and overlap counters consistent");

console.error("\nAll audio buffer checks passed");

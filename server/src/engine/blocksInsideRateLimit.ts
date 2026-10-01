/**
 * Global per-provider gates shared by every city tile fetch.
 * BlocksInside (Waze 1) plan cap is 10 req/s — space starts evenly under that so
 * multi-city polls do not 429. OpenWebNinja Waze (Waze 2) mirrors the same pacing
 * on its own independent gate so the two feeds never slow each other down.
 */

/** ~7.5 starts/sec with hard spacing (no same-ms burst of 8). */
const MIN_INTERVAL_MS = 135;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms).unref?.());
}

/**
 * One mutex + minimum gap between starts keeps the whole app under a provider's cap.
 */
function createPermitGate(minIntervalMs: number): () => Promise<void> {
  let lastStartMs = 0;
  let gate: Promise<void> = Promise.resolve();
  return async () => {
    const previous = gate;
    let release!: () => void;
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      const waitMs = Math.max(0, lastStartMs + minIntervalMs - Date.now());
      if (waitMs > 0) await sleep(waitMs);
      lastStartMs = Date.now();
    } finally {
      release();
    }
  };
}

/** Wait until this process may start one more BlocksInside HTTP call. */
export const acquireBlocksInsidePermit = createPermitGate(MIN_INTERVAL_MS);

/** Wait until this process may start one more OpenWebNinja Waze HTTP call. */
export const acquireOpenWebNinjaWazePermit = createPermitGate(MIN_INTERVAL_MS);

export function isBlocksInsideRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("429") || /rate[_\s-]?limit/i.test(message);
}

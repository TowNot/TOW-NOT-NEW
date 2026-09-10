/**
 * Global BlocksInside (api.wazeapi.com) gate shared by every city tile fetch.
 * Plan cap is 10 req/s — space starts evenly under that so multi-city polls do not 429.
 */

/** ~7.5 starts/sec with hard spacing (no same-ms burst of 8). */
const MIN_INTERVAL_MS = 135;

let lastStartMs = 0;
let gate: Promise<void> = Promise.resolve();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms).unref?.());
}

/**
 * Wait until this process may start one more BlocksInside HTTP call.
 * One global mutex + minimum gap between starts keeps the whole app under the plan cap.
 */
export async function acquireBlocksInsidePermit(): Promise<void> {
  const previous = gate;
  let release!: () => void;
  gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    const now = Date.now();
    const waitMs = Math.max(0, lastStartMs + MIN_INTERVAL_MS - now);
    if (waitMs > 0) await sleep(waitMs);
    lastStartMs = Date.now();
  } finally {
    release();
  }
}

export function isBlocksInsideRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("429") || /rate[_\s-]?limit/i.test(message);
}

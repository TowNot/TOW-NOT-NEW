/**
 * Global BlocksInside (api.wazeapi.com) gate shared by every city tile fetch.
 * Plan cap is 10 req/s — stay under it so multi-city polls do not 429.
 */

const MAX_REQUESTS_PER_WINDOW = 8;
const WINDOW_MS = 1_000;

const startTimes: number[] = [];
let gate: Promise<void> = Promise.resolve();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms).unref?.());
}

/**
 * Wait until this process may start one more BlocksInside HTTP call.
 * Serialized acquire + sliding 1s window keeps the whole app ≤ 8 starts/sec.
 */
export async function acquireBlocksInsidePermit(): Promise<void> {
  const previous = gate;
  let release!: () => void;
  gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    for (;;) {
      const now = Date.now();
      while (startTimes.length > 0 && startTimes[0]! <= now - WINDOW_MS) {
        startTimes.shift();
      }
      if (startTimes.length < MAX_REQUESTS_PER_WINDOW) {
        startTimes.push(now);
        return;
      }
      const waitMs = Math.max(5, startTimes[0]! + WINDOW_MS - now + 5);
      await sleep(waitMs);
    }
  } finally {
    release();
  }
}

export function isBlocksInsideRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("429") || /rate[_\s-]?limit/i.test(message);
}

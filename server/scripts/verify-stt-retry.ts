import assert from "node:assert/strict";
import { speechToText } from "../src/engine/deepgramClient";
import {
  isRetryableTransientError,
  STT_RETRY_POLICY,
  withTransientRetry,
} from "../src/engine/retryPolicy";

const WAV = Buffer.from("fake-wav-payload");
const TRANSCRIPT = "765 calling Engine 3, MVC Wharncliffe and Oxford, code 4";

/**
 * Shape of the reset seen in production: the SDK raises a generic connection
 * error and the real errno only appears one `cause` hop down.
 */
function connectionReset(code = "ECONNRESET"): Error {
  const cause = Object.assign(
    new Error(`request to https://api.deepgram.com/v1/listen failed`),
    { type: "system", errno: code, code },
  );
  return Object.assign(new Error("Connection error."), { cause });
}

function apiError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status });
}

function deepgramError(statusCode: number, message: string): Error {
  return Object.assign(new Error(message), { statusCode });
}

const checks: Array<[string, () => Promise<void>]> = [
  [
    "a transcription that resets once and then succeeds still returns the transcript",
    async () => {
      let calls = 0;
      const received: Buffer[] = [];
      const text = await speechToText(WAV, async (wav) => {
        calls++;
        received.push(wav);
        if (calls === 1) throw connectionReset();
        return TRANSCRIPT;
      });
      assert.equal(text, TRANSCRIPT);
      assert.equal(calls, 2);
      // The same audio must be re-sent, not a body the failed request consumed.
      assert.deepEqual(received, [WAV, WAV]);
    },
  ],
  [
    "a persistently resetting transcription gives up after a bounded number of attempts",
    async () => {
      let calls = 0;
      const startedAt = Date.now();
      await assert.rejects(
        speechToText(WAV, async () => {
          calls++;
          throw connectionReset();
        }),
        /Connection error/,
      );
      assert.equal(calls, STT_RETRY_POLICY.maxAttempts);
      assert.ok(
        Date.now() - startedAt < 20_000,
        `fast failures must not sit on the backoff for ${Date.now() - startedAt}ms`,
      );
    },
  ],
  [
    "an auth failure is surfaced immediately instead of retried",
    async () => {
      let calls = 0;
      await assert.rejects(
        speechToText(WAV, async () => {
          calls++;
          throw apiError(401, "401 Incorrect API key provided");
        }),
        /Incorrect API key/,
      );
      assert.equal(calls, 1);
    },
  ],
  [
    "Deepgram statusCode 401 is not retried; 503 is",
    async () => {
      assert.equal(isRetryableTransientError(deepgramError(401, "unauthorized")), false);
      assert.equal(isRetryableTransientError(deepgramError(503, "unavailable")), true);
    },
  ],
  [
    "the retry budget caps total wall clock even when every attempt burns its timeout",
    async () => {
      let clock = 0;
      let attempts = 0;
      await assert.rejects(
        withTransientRetry(
          STT_RETRY_POLICY,
          async () => {
            attempts++;
            clock += 40_000; // one attempt burning the SDK timeout plus its built-in retry
            throw connectionReset();
          },
          { now: () => clock, sleep: async (ms) => void (clock += ms) },
        ),
      );
      assert.equal(attempts, 2, "the budget must stop a third slow attempt");
      assert.ok(clock <= 90_000, `worst case ran ${clock}ms`);
      assert.ok(STT_RETRY_POLICY.budgetMs <= 60_000);
    },
  ],
  [
    "transient transport and server faults retry, permanent request errors do not",
    async () => {
      for (const code of ["ECONNRESET", "ETIMEDOUT", "EPIPE", "ECONNREFUSED"]) {
        assert.equal(isRetryableTransientError(connectionReset(code)), true, code);
      }
      assert.equal(isRetryableTransientError(new Error("socket hang up")), true);
      for (const status of [408, 429, 500, 502, 503]) {
        assert.equal(isRetryableTransientError(apiError(status, "upstream")), true, `${status}`);
      }
      for (const status of [400, 401, 403, 404]) {
        assert.equal(isRetryableTransientError(apiError(status, "rejected")), false, `${status}`);
      }
    },
  ],
];

async function main(): Promise<void> {
  console.error("(the retry/failure logs below are expected — these checks drive the failure paths)\n");
  let failures = 0;
  for (const [name, run] of checks) {
    try {
      await run();
      console.error(`PASS  ${name}`);
    } catch (error) {
      failures++;
      console.error(`FAIL  ${name}`);
      console.error(error);
    }
  }

  console.error(
    failures === 0 ? "\nAll STT retry checks passed" : `\n${failures} check(s) failed`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

void main();

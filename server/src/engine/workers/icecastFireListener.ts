/**
 * Resilient Icecast / continuous MP3 fire-dispatch listener.
 *
 * Used for non-Broadcastify feeds that have no HLS playlist (e.g. Waterloo
 * Region CYKF at http://cykf.net:8000/scanner). Captures fixed-length WAV
 * chunks via ffmpeg with reconnect flags, exponential backoff on failure,
 * and quiet logging so dropouts don't spam or crash the worker.
 */
import { spawn } from "node:child_process";
import { config } from "../../config";
import { logger } from "../../logger";
import { BUFFER_TARGET_SECONDS } from "./audioBuffer";
import { createFireDispatchProcessor } from "./fireDispatchPipeline";
import { registerActiveFeed, unregisterActiveFeed } from "./fireDispatchRuntime";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36";
const DIRECT_CAPTURE_GRACE_MS = 25_000;
const MIN_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 60_000;
/** Log a warn at most once per this window while reconnecting. */
const WARN_THROTTLE_MS = 60_000;

function captureChunk(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-reconnect",
      "1",
      "-reconnect_at_eof",
      "1",
      "-reconnect_streamed",
      "1",
      "-reconnect_delay_max",
      "5",
      "-rw_timeout",
      "15000000",
      "-user_agent",
      UA,
      "-i",
      url,
      "-t",
      String(BUFFER_TARGET_SECONDS),
      "-ac",
      "1",
      "-ar",
      "16000",
      "-f",
      "wav",
      "pipe:1",
    ]);
    const out: Buffer[] = [];
    const errOut: Buffer[] = [];
    let outBytes = 0;
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(killer);
      fn();
    };
    const killer = setTimeout(() => {
      ff.kill("SIGKILL");
      settle(() =>
        reject(
          new Error(
            `icecast capture timed out after ${BUFFER_TARGET_SECONDS * 1000 + DIRECT_CAPTURE_GRACE_MS}ms`,
          ),
        ),
      );
    }, BUFFER_TARGET_SECONDS * 1000 + DIRECT_CAPTURE_GRACE_MS);

    ff.stdout.on("data", (d: Buffer) => {
      outBytes += d.length;
      if (outBytes > 16 * 1024 * 1024) {
        ff.kill("SIGKILL");
        settle(() => reject(new Error("icecast capture exceeded size cap")));
        return;
      }
      out.push(d);
    });
    ff.stderr.on("data", (d: Buffer) => {
      if (errOut.length < 32) errOut.push(d);
    });
    ff.on("error", (err) => settle(() => reject(err)));
    ff.on("close", (code) => {
      settle(() => {
        const wav = Buffer.concat(out);
        // Accept usable audio even if ffmpeg exits non-zero after a mid-chunk drop.
        if (wav.length > 44 + 32_000) resolve(wav);
        else
          reject(
            new Error(
              `icecast capture exited ${code} with no audio: ${Buffer.concat(errOut).toString().slice(0, 200)}`,
            ),
          );
      });
    });
  });
}

export interface IcecastFireListenerOptions {
  zoneId: string;
  url: string;
  description: string;
  agency?: "fire" | "ems";
  keywordTriggers?: string[];
}

/**
 * Start a resilient continuous Icecast/MP3 capture loop.
 * Never throws out of the loop — dropouts reconnect with exponential backoff.
 */
export function startIcecastFireListener(opts: IcecastFireListenerOptions): () => void {
  const { zoneId, url, description, agency, keywordTriggers } = opts;
  const label = `${description}`;

  if (!config.deepgramApiKey) {
    logger.error(
      `[fire-dispatch] DEEPGRAM_API_KEY unset — Icecast listener skipped for ${label}`,
    );
    return () => undefined;
  }

  const processor = createFireDispatchProcessor({
    zoneId,
    sourceType: "stream",
    label,
    agency,
    keywordTriggers,
  });

  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let consecutiveFailures = 0;
  let lastWarnAt = 0;

  const schedule = (ms: number): void => {
    if (stopped) return;
    timer = setTimeout(loop, ms);
    timer.unref();
  };

  const loop = (): void => {
    if (stopped) return;
    void captureChunk(url)
      .then(async (wav) => {
        consecutiveFailures = 0;
        await processor.processWav(wav);
        schedule(250);
      })
      .catch((err) => {
        consecutiveFailures += 1;
        const backoffMs = Math.min(
          MAX_BACKOFF_MS,
          MIN_BACKOFF_MS * 2 ** Math.min(consecutiveFailures - 1, 5),
        );
        const now = Date.now();
        // Quiet reconnects: first failure + then at most once per minute.
        if (consecutiveFailures === 1 || now - lastWarnAt >= WARN_THROTTLE_MS) {
          lastWarnAt = now;
          logger.warn(
            `[fire-dispatch] Icecast stream dropped — reconnecting in ${Math.round(backoffMs / 1000)}s`,
            {
              label,
              zoneId,
              consecutiveFailures,
              error: err instanceof Error ? err.message : String(err),
            },
          );
        } else {
          logger.debug("[fire-dispatch] Icecast reconnect backoff", {
            label,
            consecutiveFailures,
            backoffMs,
          });
        }
        schedule(backoffMs);
      });
  };

  registerActiveFeed(label);
  logger.info(`[fire-dispatch] Icecast listener started: ${label} → zone ${zoneId} (${url})`);
  loop();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    unregisterActiveFeed(label);
  };
}

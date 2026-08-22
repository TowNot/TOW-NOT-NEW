import { spawn } from "node:child_process";
import { logger } from "../../logger";
import type { ZoneStreamAudioSource } from "../zones.config";
import { createFireDispatchProcessor } from "./fireDispatchPipeline";

const BUFFER_TARGET_SECONDS = 10;
const DIRECT_CAPTURE_GRACE_MS = 25_000;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const STREAM_REFERER = "https://www.broadcastify.com/";

function captureDirectStream(url: string): Promise<Buffer> {
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
      "-user_agent",
      UA,
      "-headers",
      `Referer: ${STREAM_REFERER}\r\n`,
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
            `direct-stream capture timed out after ${BUFFER_TARGET_SECONDS * 1000 + DIRECT_CAPTURE_GRACE_MS}ms`,
          ),
        ),
      );
    }, BUFFER_TARGET_SECONDS * 1000 + DIRECT_CAPTURE_GRACE_MS);
    ff.stdout.on("data", (d: Buffer) => {
      outBytes += d.length;
      if (outBytes > 16 * 1024 * 1024) {
        ff.kill("SIGKILL");
        settle(() => reject(new Error("direct-stream capture exceeded size cap")));
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
        if (wav.length > 44 + 32000) resolve(wav);
        else
          reject(
            new Error(
              `direct-stream capture exited ${code} with no audio: ${Buffer.concat(errOut).toString().slice(0, 300)}`,
            ),
          );
      });
    });
  });
}

/** Continuous MP3/HLS stream capture for a zone `stream` audio source. */
export function startZoneStreamListener(
  zoneId: string,
  source: ZoneStreamAudioSource,
): () => void {
  const processor = createFireDispatchProcessor({
    zoneId,
    sourceType: "stream",
    label: source.description,
  });

  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let consecutiveFailures = 0;

  const schedule = (ms: number): void => {
    if (stopped) return;
    timer = setTimeout(loop, ms);
  };

  const loop = (): void => {
    if (stopped) return;
    void captureDirectStream(source.url)
      .then((wav) => {
        consecutiveFailures = 0;
        return processor.processWav(wav);
      })
      .then(() => schedule(250))
      .catch((err) => {
        consecutiveFailures += 1;
        const backoffMs = Math.min(30_000, 2_000 * consecutiveFailures);
        logger.warn(
          `[fire-dispatch] stream capture failed — retrying in ${backoffMs / 1000}s`,
          { err, zoneId, url: source.url, consecutiveFailures },
        );
        schedule(backoffMs);
      });
  };

  logger.info(
    `[fire-dispatch] stream listener started: ${source.description} (${source.url})`,
  );
  loop();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

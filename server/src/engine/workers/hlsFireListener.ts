/**
 * Reusable Broadcastify HLS fire-dispatch listener.
 *
 * Polls a signed playlist URL minted per session (see broadcastifySession),
 * buffers ~10s of MPEG-TS segments with rolling overlap, converts to WAV,
 * and hands audio to the shared STT → incident pipeline.
 *
 * Broadcastify's HLS origin 403s Node's fetch fingerprint, so all HTTP goes
 * through the system `curl` binary.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import { config } from "../../config";
import { logger } from "../../logger";
import {
  BUFFER_TARGET_SECONDS,
  createAudioBufferState,
  pushSegment,
  readyToFlush,
  resetAudioBuffer,
  shedOldestSegments,
  takeFlushChunk,
  type AudioBufferState,
} from "./audioBuffer";
import { mintBroadcastifyHlsUrl } from "./broadcastifySession";
import { createFireDispatchProcessor } from "./fireDispatchPipeline";
import {
  noteAudioSegment,
  noteFireDispatchDiscard,
  registerActiveFeed,
  unregisterActiveFeed,
} from "./fireDispatchRuntime";

export {
  getFireDispatchRuntime,
  noteFireDispatchPosted,
  noteFireDispatchSkip,
  noteFireDispatchTranscript,
} from "./fireDispatchRuntime";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36";
const STREAM_REFERER = "https://www.broadcastify.com";
const POLL_INTERVAL_MS = 5_000;
const MAX_HTTP_RESPONSE_BYTES = 4 * 1024 * 1024;
const SUBPROCESS_TIMEOUT_MS = 40_000;
const FFMPEG_TIMEOUT_MS = 60_000;
const WATCHDOG_SILENCE_MS = 2 * 60 * 1000;
/** Playlist failures in a row before minting a fresh signed URL. */
const REMINT_AFTER_FAILURES = 2;
/** Minimum spacing between mint attempts when minting keeps failing. */
const MINT_RETRY_MS = 60_000;
const MINT_MIN_GAP_MS = 20_000;

interface StreamState extends AudioBufferState {
  /** Signed playlist URL; empty until minted. */
  hlsUrl: string;
  lastSequence: number;
  consecutiveFailures: number;
  lastAudioAt: number;
  lastMintAttemptAt: number;
  mintFailures: number;
  firstAudioLogged: boolean;
}

function curlFetch(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn("curl", [
      "-sS",
      "--fail-with-body",
      "--max-time",
      "25",
      "--connect-timeout",
      "10",
      "--retry",
      "3",
      "--retry-delay",
      "2",
      "--retry-max-time",
      "30",
      "--max-filesize",
      String(MAX_HTTP_RESPONSE_BYTES),
      "-A",
      UA,
      "-H",
      `Referer: ${STREAM_REFERER}`,
      url,
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
      proc.kill("SIGKILL");
      settle(() => reject(new Error(`curl GET timed out (hard kill)`)));
    }, SUBPROCESS_TIMEOUT_MS);
    proc.stdout.on("data", (d: Buffer) => {
      outBytes += d.length;
      if (outBytes > MAX_HTTP_RESPONSE_BYTES) {
        proc.kill("SIGKILL");
        settle(() => reject(new Error(`curl GET exceeded size cap`)));
        return;
      }
      out.push(d);
    });
    proc.stderr.on("data", (d: Buffer) => {
      if (errOut.length < 32) errOut.push(d);
    });
    proc.on("error", (err) => settle(() => reject(err)));
    proc.on("close", (code) => {
      settle(() => {
        if (code === 0) resolve(Buffer.concat(out));
        else
          reject(
            new Error(
              `curl exited ${code}: ${Buffer.concat(errOut).toString().slice(0, 200)}`,
            ),
          );
      });
    });
  });
}

async function fetchText(url: string): Promise<string> {
  return (await curlFetch(url)).toString("utf8");
}

/** First variant of a master playlist, or null if this is already a media playlist. */
function firstVariantUrl(text: string, baseUrl: string): string | null {
  if (!text.includes("#EXT-X-STREAM-INF")) return null;
  const lines = text.split("\n").map((l) => l.trim());
  const idx = lines.findIndex((l) => l.startsWith("#EXT-X-STREAM-INF"));
  const uri = lines.slice(idx + 1).find((l) => l.length > 0 && !l.startsWith("#"));
  return uri ? new URL(uri, baseUrl).toString() : null;
}

interface PlaylistSegment {
  sequence: number;
  url: string;
  seconds: number;
}

function parsePlaylist(text: string, baseUrl: string): PlaylistSegment[] {
  const lines = text.split("\n").map((l) => l.trim());
  const seqLine = lines.find((l) => l.startsWith("#EXT-X-MEDIA-SEQUENCE:"));
  let sequence = seqLine ? Number(seqLine.split(":")[1]) : 0;
  const segments: PlaylistSegment[] = [];
  let seconds = 4;
  for (const line of lines) {
    if (line.startsWith("#EXTINF:")) {
      seconds = Number.parseFloat(line.slice(8)) || 4;
    } else if (line.length > 0 && !line.startsWith("#")) {
      segments.push({
        sequence: sequence++,
        url: new URL(line, baseUrl).toString(),
        seconds,
      });
    }
  }
  return segments;
}

async function tsToWav(tsBuffer: Buffer): Promise<Buffer> {
  const tmpPath = `/tmp/hls-${process.pid}-${Math.random().toString(36).slice(2)}.ts`;
  await fs.promises.writeFile(tmpPath, tsBuffer);
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      const ff = spawn("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "mpegts",
        "-i",
        tmpPath,
        "-ac",
        "1",
        "-ar",
        "16000",
        "-preset",
        "ultrafast",
        "-threads",
        "2",
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
        settle(() => reject(new Error(`ffmpeg timed out after ${FFMPEG_TIMEOUT_MS}ms`)));
      }, FFMPEG_TIMEOUT_MS);
      ff.stdout.on("data", (d: Buffer) => {
        outBytes += d.length;
        if (outBytes > 16 * 1024 * 1024) {
          ff.kill("SIGKILL");
          settle(() => reject(new Error("ffmpeg output exceeded size cap")));
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
          if (code === 0 && out.length > 0) resolve(Buffer.concat(out));
          else
            reject(
              new Error(
                `ffmpeg exited ${code}: ${Buffer.concat(errOut).toString().slice(0, 300)}`,
              ),
            );
        });
      });
    });
  } finally {
    void fs.promises.unlink(tmpPath).catch(() => undefined);
  }
}

export interface HlsFireListenerOptions {
  zoneId: string;
  feedId: number;
  description: string;
}

/**
 * Start an HLS playlist poller for a Broadcastify feed.
 * Returns a stop function.
 */
export function startHlsFireListener(opts: HlsFireListenerOptions): () => void {
  const { zoneId, feedId, description } = opts;
  const label = `${description} (feed ${feedId})`;

  if (!config.deepgramApiKey) {
    logger.error(
      `[fire-dispatch] DEEPGRAM_API_KEY unset — HLS listener skipped for ${label}`,
    );
    return () => undefined;
  }

  const processor = createFireDispatchProcessor({
    zoneId,
    sourceType: "hls",
    label,
  });

  const state: StreamState = {
    ...createAudioBufferState(),
    hlsUrl: "",
    lastSequence: -1,
    consecutiveFailures: 0,
    lastAudioAt: Date.now(),
    lastMintAttemptAt: 0,
    mintFailures: 0,
    firstAudioLogged: false,
  };

  /** Replace the playlist URL with a freshly minted signed one. */
  const remint = async (): Promise<boolean> => {
    const minGap = state.mintFailures > 0 ? MINT_RETRY_MS : MINT_MIN_GAP_MS;
    if (Date.now() - state.lastMintAttemptAt < minGap) return false;
    state.lastMintAttemptAt = Date.now();
    const fresh = await mintBroadcastifyHlsUrl(feedId);
    if (!fresh) {
      state.mintFailures += 1;
      return false;
    }
    state.mintFailures = 0;
    state.hlsUrl = fresh;
    state.lastSequence = -1;
    state.consecutiveFailures = 0;
    return true;
  };

  let stopped = false;
  let inFlight = false;
  let processingBusy = false;
  registerActiveFeed(label);

  logger.info(`[fire-dispatch] HLS listener started: ${label} → zone ${zoneId}`);

  const pollOnce = async (): Promise<void> => {
    if (!state.hlsUrl && !(await remint())) return;

    let playlistText: string;
    try {
      playlistText = await fetchText(state.hlsUrl);
      state.consecutiveFailures = 0;
    } catch (err) {
      state.consecutiveFailures += 1;
      if (state.consecutiveFailures === 1 || state.consecutiveFailures % 10 === 0) {
        logger.warn("[fire-dispatch] playlist fetch failed", {
          err,
          feedId,
          failures: state.consecutiveFailures,
        });
      }
      if (state.consecutiveFailures >= REMINT_AFTER_FAILURES) {
        await remint();
      }
      return;
    }

    const variant = firstVariantUrl(playlistText, state.hlsUrl);
    if (variant) {
      state.hlsUrl = variant;
      return;
    }

    const segments = parsePlaylist(playlistText, state.hlsUrl);
    const newest = segments[segments.length - 1];
    if (newest) {
      if (state.lastSequence < 0) {
        state.lastSequence = newest.sequence - 1;
      } else if (newest.sequence < state.lastSequence) {
        logger.debug(
          `[fire-dispatch] HLS sequence regressed for feed ${feedId}; rebasing`,
        );
        state.lastSequence = newest.sequence - 1;
      }
    }

    const fresh = segments.filter((s) => s.sequence > state.lastSequence);
    for (const seg of fresh) {
      try {
        const data = await curlFetch(seg.url);
        pushSegment(state, data, seg.seconds);
        state.lastSequence = seg.sequence;
        state.lastAudioAt = Date.now();
        noteAudioSegment();
        if (!state.firstAudioLogged) {
          state.firstAudioLogged = true;
          logger.info(`[fire-dispatch] receiving audio from ${label}`);
        }
      } catch (err) {
        logger.warn("[fire-dispatch] segment fetch failed", {
          err,
          feedId,
          sequence: seg.sequence,
        });
        state.lastSequence = seg.sequence;
      }
    }

    if (readyToFlush(state) && !processingBusy) {
      const chunk = takeFlushChunk(state);
      processingBusy = true;
      void tsToWav(Buffer.concat(chunk))
        .then((wav) => processor.processWav(wav))
        .catch((err) => {
          noteFireDispatchDiscard(err instanceof Error ? err.message : String(err));
          logger.error("[fire-dispatch] HLS buffer processing failed", {
            err,
            feedId,
            segments: chunk.length,
          });
        })
        .finally(() => {
          processingBusy = false;
        });
    } else if (state.pending.length > 12 * 3) {
      const dropped = shedOldestSegments(state);
      logger.warn(
        `[fire-dispatch] HLS processor busy — dropped ${dropped} oldest segment(s) (${label})`,
      );
    }
  };

  const pollTimer = setInterval(() => {
    if (stopped || inFlight) return;
    inFlight = true;
    void pollOnce()
      .catch((err) =>
        logger.warn("[fire-dispatch] HLS poll pass failed", { err, feedId }),
      )
      .finally(() => {
        inFlight = false;
      });
  }, POLL_INTERVAL_MS);
  pollTimer.unref();

  const watchdogTimer = setInterval(() => {
    if (stopped) return;
    const silentMs = Date.now() - state.lastAudioAt;
    if (silentMs < WATCHDOG_SILENCE_MS) return;
    logger.warn(
      `[fire-dispatch] WATCHDOG: no audio for ${Math.round(silentMs / 1000)}s on ${label} — resetting`,
    );
    state.lastAudioAt = Date.now();
    resetAudioBuffer(state);
    state.lastSequence = -1;
    state.consecutiveFailures = 0;
    state.firstAudioLogged = false;
    void remint();
  }, 30_000);
  watchdogTimer.unref();

  // Kick first poll immediately
  void pollOnce().catch(() => undefined);

  return () => {
    stopped = true;
    clearInterval(pollTimer);
    clearInterval(watchdogTimer);
    unregisterActiveFeed(label);
  };
}

/** @deprecated Prefer startHlsFireListener — kept for buffer unit tests. */
export {
  createAudioBufferState,
  pushSegment,
  readyToFlush,
  shedOldestSegments,
  takeFlushChunk,
  BUFFER_TARGET_SECONDS,
};

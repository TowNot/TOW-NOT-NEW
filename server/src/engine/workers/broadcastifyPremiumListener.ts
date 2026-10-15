/**
 * Broadcastify Premium static-URL listener (e.g. https://audio.broadcastify.com/34296.mp3).
 *
 * Premium accounts get a direct Icecast MP3 stream behind HTTP Basic auth.
 * Premium allows one concurrent stream per login, so this keeps a single
 * long-lived connection (curl → ffmpeg → 16 kHz mono PCM) and slices it into
 * overlapping WAV chunks locally instead of reconnecting per chunk.
 *
 * curl is fed its credentials on stdin (never argv/logs) and only sends them
 * to the original host — they are not forwarded across redirects.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { config } from "../../config";
import { logger } from "../../logger";
import { BUFFER_TARGET_SECONDS, OVERLAP_TARGET_SECONDS } from "./audioBuffer";
import { createFireDispatchProcessor } from "./fireDispatchPipeline";
import {
  noteAudioSegment,
  noteFireDispatchDiscard,
  registerActiveFeed,
  unregisterActiveFeed,
} from "./fireDispatchRuntime";
import type { IcecastFireListenerOptions } from "./icecastFireListener";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36";
const SAMPLE_RATE = 16_000;
const BYTES_PER_SECOND = SAMPLE_RATE * 2;
const CHUNK_BYTES = BUFFER_TARGET_SECONDS * BYTES_PER_SECOND;
const OVERLAP_BYTES = OVERLAP_TARGET_SECONDS * BYTES_PER_SECOND;
/** If transcription falls behind, keep at most this much unprocessed audio. */
const MAX_PENDING_BYTES = 60 * BYTES_PER_SECOND;
const STALL_TIMEOUT_MS = 60_000;
const MIN_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 5 * 60_000;
/** A connection that streamed this long counts as healthy and resets backoff. */
const HEALTHY_CONNECTION_MS = 2 * 60_000;

function pcmToWav(pcm: Buffer): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(BYTES_PER_SECOND, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** curl config-file quoting: backslash and double quote must be escaped. */
function curlConfigQuote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function startBroadcastifyPremiumListener(opts: IcecastFireListenerOptions): () => void {
  const { zoneId, url, description: label, agency, keywordTriggers } = opts;

  if (!config.deepgramApiKey) {
    logger.error(`[fire-dispatch] DEEPGRAM_API_KEY unset — listener skipped for ${label}`);
    return () => undefined;
  }
  if (!config.broadcastifyUsername || !config.broadcastifyPassword) {
    logger.error(
      `[fire-dispatch] BROADCASTIFY_USERNAME / BROADCASTIFY_PASSWORD not set — ${label} needs your Broadcastify Premium login`,
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
  let curl: ChildProcess | null = null;
  let ffmpeg: ChildProcess | null = null;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let stallTimer: NodeJS.Timeout | null = null;
  let consecutiveFailures = 0;

  /** Carried overlap + not-yet-transcribed PCM. */
  let pending: Buffer = Buffer.alloc(0);
  /** Bytes at the head of `pending` that were already sent (overlap carry). */
  let carriedBytes = 0;
  let processing = false;

  const flush = (): void => {
    if (processing || pending.length - carriedBytes < CHUNK_BYTES) return;
    const chunk = pending;
    pending = chunk.subarray(Math.max(0, chunk.length - OVERLAP_BYTES));
    carriedBytes = pending.length;
    processing = true;
    noteAudioSegment();
    void processor
      .processWav(pcmToWav(chunk))
      .catch((err) => {
        noteFireDispatchDiscard(err instanceof Error ? err.message : String(err));
        logger.error(`[fire-dispatch] ${label} chunk processing failed`, { err });
      })
      .finally(() => {
        processing = false;
        flush();
      });
  };

  const onPcm = (data: Buffer): void => {
    pending = Buffer.concat([pending, data]);
    if (pending.length > MAX_PENDING_BYTES) {
      const dropped = pending.length - MAX_PENDING_BYTES;
      pending = pending.subarray(dropped);
      carriedBytes = Math.max(0, carriedBytes - dropped);
      logger.warn(
        `[fire-dispatch] ${label} transcription behind — dropped ${Math.round(dropped / BYTES_PER_SECOND)}s of audio`,
      );
    }
    flush();
  };

  const killChildren = (): void => {
    curl?.kill("SIGKILL");
    ffmpeg?.kill("SIGKILL");
    curl = null;
    ffmpeg = null;
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = null;
  };

  const connect = (): void => {
    if (stopped) return;
    const connectedAt = Date.now();
    let receivedAudio = false;
    let ended = false;
    const curlErr: Buffer[] = [];
    const ffErr: Buffer[] = [];

    const thisCurl = spawn("curl", [
      "-sS",
      "--fail",
      "-L",
      "--max-redirs",
      "3",
      "--connect-timeout",
      "15",
      "--speed-limit",
      "1",
      "--speed-time",
      "60",
      "-A",
      UA,
      "-K",
      "-",
      url,
    ]);
    const thisFfmpeg = spawn("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      "pipe:0",
      "-ac",
      "1",
      "-ar",
      String(SAMPLE_RATE),
      "-f",
      "s16le",
      "pipe:1",
    ]);
    curl = thisCurl;
    ffmpeg = thisFfmpeg;

    thisCurl.stdin.end(
      `user = ${curlConfigQuote(`${config.broadcastifyUsername}:${config.broadcastifyPassword}`)}\n`,
    );
    thisCurl.stdout.pipe(thisFfmpeg.stdin);
    thisFfmpeg.stdin.on("error", () => undefined);
    thisCurl.stderr.on("data", (d: Buffer) => {
      if (curlErr.length < 16) curlErr.push(d);
    });
    thisFfmpeg.stderr.on("data", (d: Buffer) => {
      if (ffErr.length < 16) ffErr.push(d);
    });

    const armStallTimer = (): void => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        logger.warn(`[fire-dispatch] ${label} stream stalled for ${STALL_TIMEOUT_MS / 1000}s — reconnecting`);
        thisCurl.kill("SIGKILL");
        thisFfmpeg.kill("SIGKILL");
      }, STALL_TIMEOUT_MS);
      stallTimer.unref();
    };
    armStallTimer();

    thisFfmpeg.stdout.on("data", (d: Buffer) => {
      armStallTimer();
      if (!receivedAudio) {
        receivedAudio = true;
        logger.info(`[fire-dispatch] receiving audio from ${label}`);
      }
      onPcm(d);
    });

    const onEnd = (): void => {
      if (ended) return;
      ended = true;
      thisCurl.kill("SIGKILL");
      thisFfmpeg.kill("SIGKILL");
      if (curl === thisCurl) killChildren();
      if (stopped) return;

      if (Date.now() - connectedAt >= HEALTHY_CONNECTION_MS) consecutiveFailures = 0;
      consecutiveFailures += 1;
      const backoffMs = Math.min(
        MAX_BACKOFF_MS,
        MIN_BACKOFF_MS * 2 ** Math.min(consecutiveFailures - 1, 6),
      );
      const reason =
        Buffer.concat(curlErr).toString().trim().slice(0, 200) ||
        Buffer.concat(ffErr).toString().trim().slice(0, 200) ||
        "stream ended";
      const hint = /returned error: 401/.test(reason)
        ? " — Broadcastify rejected the login; check BROADCASTIFY_USERNAME / BROADCASTIFY_PASSWORD (use your username, Premium required)"
        : /returned error: 403/.test(reason)
          ? " — Broadcastify refused the stream (Premium may be inactive, or this login is already streaming elsewhere)"
          : "";
      logger.warn(
        `[fire-dispatch] ${label} disconnected: ${reason}${hint} — reconnecting in ${Math.round(backoffMs / 1000)}s`,
        { zoneId, consecutiveFailures },
      );
      reconnectTimer = setTimeout(connect, backoffMs);
      reconnectTimer.unref();
    };

    thisCurl.on("error", onEnd);
    thisFfmpeg.on("error", onEnd);
    thisCurl.on("close", onEnd);
    thisFfmpeg.on("close", onEnd);
  };

  registerActiveFeed(label);
  logger.info(`[fire-dispatch] Broadcastify Premium listener started: ${label} → zone ${zoneId} (${url})`);
  connect();

  return () => {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    killChildren();
    unregisterActiveFeed(label);
  };
}

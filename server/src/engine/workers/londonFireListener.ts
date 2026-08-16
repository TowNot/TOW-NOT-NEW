/**
 * London Fire cloud audio listener.
 *
 * Pipes the Broadcastify Feed 34296 ("London Fire and Public Works") public
 * HLS stream into 15-second in-memory audio buffers, transcribes each buffer
 * with OpenAI speech-to-text, scans transcripts for crash keywords, extracts
 * and geocodes cross-streets, then stores crash dispatches as incidents with
 * provider `london_fire_dispatch` — gated by the standard 350m dedup filter —
 * and push/SMS-notifies immediately.
 *
 * Stream notes (verified live):
 *  - The legacy Icecast URL (audio.broadcastify.com/34296.mp3) is 401 Basic
 *    auth — premium only. The web player's HLS origin is public, no auth:
 *    https://hls-o1.broadcastify.com/s0/feed/34296/playlist.m3u8
 *  - Segments are ~4.023s MPEG-TS wrapping mono 22.05kHz MP3. Four segments
 *    ≈ 16s ≈ one transcription buffer.
 *  - If the HLS path token rotates, we re-scrape the popout player page for
 *    the fresh hlsUrl.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import { extractJsonLocation, speechToText } from "../openaiClient";
import { distanceKm } from "../geo";
import { logger } from "../pinoCompat";
import { config } from "../../config";
import type { Incident } from "../../types/incident";
import type { IncidentStore } from "../../store/incidentStore";

const FEED_ID = 34296;
const DEFAULT_HLS_URL = `https://hls-o1.broadcastify.com/s0/feed/${FEED_ID}/playlist.m3u8`;
const POPOUT_URL = `https://www.broadcastify.com/listen/feed/popout.php?feedId=${FEED_ID}`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const STREAM_REFERER = "https://www.broadcastify.com/";

const POLL_INTERVAL_MS = 5_000; // playlist re-poll cadence
const BUFFER_TARGET_SECONDS = 15; // flush transcription buffer at ≥15s of NEW audio
const MAX_BUFFERED_SEGMENTS = 12; // hard cap so a stall can't grow memory
// Rolling overlap: the tail of each flushed buffer is re-queued at the head of
// the next one so a dispatch spoken across a chunk boundary ("single vehicle
// MVC, Wharncliffe and…" | "…Oxford") is transcribed whole at least once.
// Overlap audio is excluded from the flush thresholds, so a 15s buffer still
// carries 15s of new audio plus the 4s replay.
const OVERLAP_TARGET_SECONDS = 4;

// Silence gate: dispatch channels are dead air most of the day. Buffers whose
// RMS is below this threshold are dropped before transcription so we don't
// burn STT credits on static/silence. -50 dBFS is well below spoken dispatch
// audio (~-25 to -15 dBFS) but above idle carrier hiss.
const SILENCE_RMS_DBFS = -50;

/**
 * Crash detection patterns for London Fire dispatch traffic.
 *  - "MVC" (Motor Vehicle Collision) is the primary acronym, including
 *    punctuated ("M.V.C.") and radio-static/STT misreads ("NBC" — Whisper
 *    frequently mishears the acronym over carrier hiss).
 *  - Full terms: collision, accident, rollover, extrication, trapped,
 *    vehicle fire.
 *  - Multi-car counts: "1-car", "two-vehicle", "3 car", etc.
 */
const CRASH_PATTERNS: { label: string; re: RegExp }[] = [
  // Acronyms incl. punctuated/spaced forms and STT misreads over static:
  // "MVC" / "M.V.C." / "MV C", "MVA", "NBC" (Whisper misread), "N V C".
  { label: "MVC", re: /\bM\.?\s?V\.?\s?C\.?\b/i },
  { label: "MVA", re: /\bM\.?\s?V\.?\s?A\.?\b/i },
  { label: "MVC", re: /\bNBC\b/i }, // static/STT misread of "MVC"
  { label: "MVC", re: /\bN\.?\s?V\.?\s?C\.?\b/i }, // static/STT misread of "MVC"
  { label: "collision", re: /\bcollisions?\b/i },
  { label: "vehicle collision", re: /\b(?:vehicle|motor\s+vehicle)\s+collisions?\b/i },
  { label: "motor vehicle", re: /\bmotor\s+vehicles?\b/i },
  { label: "accident", re: /\baccidents?\b/i },
  { label: "rollover", re: /\broll[- ]?overs?\b/i },
  { label: "t-bone", re: /\bt[- ]?bones?d?\b/i },
  { label: "rear end", re: /\brear[- ]?end(?:ed|s)?\b/i },
  { label: "extrication", re: /\bextricat(?:ion|e|ed|ing)\b/i },
  { label: "trapped", re: /\btrapped\b/i },
  { label: "patients", re: /\bpatients?\s+total\b/i },
  { label: "personal injury", re: /\bpersonal\s+injur(?:y|ies)\b/i },
  { label: "vehicle fire", re: /\b(?:vehicle|car|auto)\s+fire\b/i },
  {
    label: "multi-vehicle",
    re: /\b(?:\d+|one|two|three|four|five|single|multi(?:ple)?)[\s-]?(?:car|vehicle)s?\b/i,
  },
];

/**
 * Response-code urgency. London Fire: Code 4 = emergency (lights & sirens),
 * Code 3 = non-emergency/routine (e.g. debris cleanup).
 */
const CODE4_RE = /\bcode\s*(?:4|four)\b/i;
const CODE3_RE = /\bcode\s*(?:3|three)\b/i;

type DispatchPriority = "critical" | "high" | "normal";

/**
 * Priority rules: any MVC/crash keyword hit → "critical" (mandatory
 * post-and-notify, no exceptions). Code 4 without crash language → "high".
 * Code 3 routine calls → "normal".
 */
function classifyPriority(transcript: string): DispatchPriority {
  // Any collision-pattern hit is immediately CRITICAL — a matched dispatch
  // is an active crash scene and must always be posted.
  if (CRASH_PATTERNS.some(({ re }) => re.test(transcript))) return "critical";
  if (CODE4_RE.test(transcript)) return "high";
  if (CODE3_RE.test(transcript)) return "normal";
  return "normal";
}

// London, ON coverage bounds for geocode sanity checks.
const LONDON_CENTER = { lat: 42.9849, lng: -81.2453 };
// Fallback pin for calls whose address could not be geocoded — the fixed
// subscription-zone center. Rows carry unverifiedAddress=true.
const LONDON_FALLBACK_COORDS = { lat: 42.9837, lng: -81.2497 };
const MAX_GEOCODE_DISTANCE_KM = 25;

const log = (msg: string) => console.log(`[fire-dispatch] ${msg}`);

export interface AudioBufferState {
  pending: Buffer[]; // raw MPEG-TS segments awaiting transcription
  pendingSegSeconds: number[]; // per-segment durations, parallel to `pending`
  pendingSeconds: number;
  overlapSeconds: number; // replayed tail seconds carried from the last flush
  overlapSegments: number; // replayed tail segment count carried from the last flush
}

interface StreamState extends AudioBufferState {
  hlsUrl: string;
  lastSequence: number; // highest media-sequence already downloaded
  consecutiveFailures: number;
  lastAudioAt: number; // epoch-ms of the last successfully fetched audio segment
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

/**
 * Replayed overlap audio never counts toward a flush, so each buffer still
 * carries a full BUFFER_TARGET_SECONDS of newly fetched audio on top of the
 * repeated tail.
 */
export function readyToFlush(state: AudioBufferState): boolean {
  const freshSeconds = state.pendingSeconds - state.overlapSeconds;
  const freshSegments = state.pending.length - state.overlapSegments;
  return freshSeconds >= BUFFER_TARGET_SECONDS || freshSegments >= MAX_BUFFERED_SEGMENTS;
}

/**
 * Hand the buffered segments to the transcriber and re-queue the trailing
 * ~OVERLAP_TARGET_SECONDS at the head of the next buffer. Never carries the
 * entire buffer: a single-segment chunk would otherwise replay forever
 * without the stream ever advancing.
 */
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

/** Shed the oldest backlog when the transcriber has been busy too long. */
export function shedOldestSegments(state: AudioBufferState): number {
  const dropped = state.pending.length - MAX_BUFFERED_SEGMENTS;
  state.pending = state.pending.slice(-MAX_BUFFERED_SEGMENTS);
  state.pendingSegSeconds = state.pendingSegSeconds.slice(-MAX_BUFFERED_SEGMENTS);
  state.pendingSeconds = state.pendingSegSeconds.reduce((sum, s) => sum + s, 0);
  // The shed dropped the replayed tail along with the backlog.
  state.overlapSeconds = 0;
  state.overlapSegments = 0;
  return dropped;
}

/* ------------------------------------------------------------------ */
/* HLS fetching                                                       */
/* ------------------------------------------------------------------ */

/**
 * Fetch via the system `curl` binary. Broadcastify's HLS origin 403s Node's
 * fetch/undici TLS+HTTP/2 fingerprint (verified: identical headers 403 from
 * Node, 200 from curl), so all stream HTTP goes through curl subprocesses.
 */
const MAX_HTTP_RESPONSE_BYTES = 4 * 1024 * 1024; // playlist ≈1KB, segment ≈10-60KB
// Must exceed curl's own worst case: --retry-max-time 30 caps the whole
// retry window, so the hard kill sits above it with headroom.
const SUBPROCESS_TIMEOUT_MS = 40_000;
// Dedicated ffmpeg conversion timeout. Long dispatches plus the rolling
// overlap push buffers past 19s of audio, and a hard kill mid-convert drops
// the whole call, so the conversion window is generous.
const FFMPEG_TIMEOUT_MS = 60_000;
// Direct-stream capture keeps a tighter grace period on top of the capture
// window: an unreachable RADIO_HLS_URL must fail fast enough for the HLS
// fallback to take over instead of stalling behind the conversion timeout.
const DIRECT_CAPTURE_GRACE_MS = 25_000;

function curlFetch(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn("curl", [
      "-sS",
      "--fail-with-body",
      "--max-time", "25",
      "--connect-timeout", "10",
      "--retry", "3",
      "--retry-delay", "2",
      "--retry-max-time", "30",
      "--max-filesize", String(MAX_HTTP_RESPONSE_BYTES),
      "-A", UA,
      "-H", `Referer: ${STREAM_REFERER}`,
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
    // Hard kill: -m only bounds curl's own clock; never trust it exclusively.
    const killer = setTimeout(() => {
      proc.kill("SIGKILL");
      settle(() => reject(new Error(`curl GET ${url} timed out (hard kill)`)));
    }, SUBPROCESS_TIMEOUT_MS);
    proc.stdout.on("data", (d: Buffer) => {
      outBytes += d.length;
      if (outBytes > MAX_HTTP_RESPONSE_BYTES) {
        proc.kill("SIGKILL");
        settle(() =>
          reject(new Error(`curl GET ${url} exceeded ${MAX_HTTP_RESPONSE_BYTES} bytes`)),
        );
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
              `curl GET ${url} exited ${code}: ${Buffer.concat(errOut).toString().slice(0, 200)}`,
            ),
          );
      });
    });
  });
}

async function fetchText(url: string): Promise<string> {
  return (await curlFetch(url)).toString("utf8");
}

async function fetchBinary(url: string): Promise<Buffer> {
  return curlFetch(url);
}

/** Re-scrape the public popout player page for the current hlsUrl. */
async function rediscoverHlsUrl(): Promise<string | null> {
  try {
    const html = await fetchText(POPOUT_URL);
    const m = html.match(/hlsUrl:\s*"([^"]+)"/);
    if (m?.[1]) {
      const url = m[1].replace(/\\\//g, "/");
      log(`Rediscovered HLS url: ${url}`);
      return url;
    }
  } catch (err) {
    logger.error({ err }, "[fire-dispatch] popout re-scrape failed");
  }
  return null;
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

/* ------------------------------------------------------------------ */
/* Audio processing                                                   */
/* ------------------------------------------------------------------ */

/** Convert concatenated MPEG-TS chunks to a 16kHz mono WAV via ffmpeg. */
async function tsToWav(tsBuffer: Buffer): Promise<Buffer> {
  // File-based input instead of stdin pipe: piping mpegts through pipe:0
  // was observed hanging ffmpeg until the hard-kill timeout in production
  // (every buffer failed "ffmpeg timed out"), silently dropping all audio.
  // A concrete temp file lets ffmpeg probe/seek freely and cannot stall on
  // stdin backpressure.
  const tmpPath = `/tmp/lfd-${process.pid}-${Math.random().toString(36).slice(2)}.ts`;
  await fs.promises.writeFile(tmpPath, tsBuffer);
  try {
    return await tsFileToWav(tmpPath, tsBuffer.length);
  } finally {
    void fs.promises.unlink(tmpPath).catch(() => {});
  }
}

function tsFileToWav(tsPath: string, inputBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", [
      "-hide_banner",
      "-loglevel", "error",
      "-f", "mpegts",
      "-i", tsPath,
      "-ac", "1",
      "-ar", "16000",
      "-preset", "ultrafast",
      "-threads", "2",
      "-f", "wav",
      "pipe:1",
    ]);
    const MAX_WAV_BYTES = 16 * 1024 * 1024; // ~8 min of 16kHz mono PCM — far above a 15s buffer
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
            `ffmpeg timed out after ${FFMPEG_TIMEOUT_MS}ms (hard kill) — input ${inputBytes} bytes`,
          ),
        ),
      );
    }, FFMPEG_TIMEOUT_MS);
    ff.stdout.on("data", (d: Buffer) => {
      outBytes += d.length;
      if (outBytes > MAX_WAV_BYTES) {
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
}

/** RMS level in dBFS of a PCM16 WAV buffer (skips the 44-byte header). */
function wavRmsDbfs(wav: Buffer): number {
  const dataStart = 44;
  const samples = Math.floor((wav.length - dataStart) / 2);
  if (samples <= 0) return -Infinity;
  let sumSquares = 0;
  for (let i = 0; i < samples; i++) {
    const s = wav.readInt16LE(dataStart + i * 2) / 32768;
    sumSquares += s * s;
  }
  const rms = Math.sqrt(sumSquares / samples);
  return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
}

function findCrashKeywords(transcript: string): string[] {
  const hits: string[] = [];
  for (const { label, re } of CRASH_PATTERNS) {
    if (re.test(transcript) && !hits.includes(label)) hits.push(label);
  }
  // The multi-vehicle count pattern alone ("two vehicles on scene") is too
  // weak to declare a crash — require at least one substantive crash term.
  if (hits.length === 1 && hits[0] === "multi-vehicle") return [];
  return hits;
}

/* ------------------------------------------------------------------ */
/* Location extraction + geocoding                                    */
/* ------------------------------------------------------------------ */

/**
 * LLM pass to pull a street/intersection out of a noisy scanner transcript.
 * Only runs on the rare buffers that already hit a crash keyword.
 */
async function extractLocation(transcript: string): Promise<string | null> {
  return extractJsonLocation(transcript);
}

// London, ON bounding box for Overpass street-intersection queries.
const LONDON_BBOX = "42.85,-81.45,43.08,-81.10";
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

function withinLondon(lat: number, lng: number): boolean {
  return (
    distanceKm(LONDON_CENTER.lat, LONDON_CENTER.lng, lat, lng) <=
    MAX_GEOCODE_DISTANCE_KM
  );
}

/**
 * Strip directional/type suffix noise for Overpass regex matching:
 * "Wharncliffe Road North" -> "Wharncliffe".
 */
function streetStem(street: string): string {
  const stem = street
    .replace(
      /\b(north|south|east|west|road|rd|street|st|avenue|ave|drive|dr|boulevard|blvd|line|highway|hwy|court|crt|crescent|cres|way|place|pl)\b\.?/gi,
      "",
    )
    .trim()
    .replace(/\s+/g, " ");
  // Strict allow-list before interpolation into the Overpass QL string:
  // LLM-derived text must never carry quotes, backslashes, or regex/QL
  // metacharacters into the query. Reject instead of stripping so a mangled
  // name falls through to the Nominatim path rather than querying garbage.
  if (
    stem.length === 0 ||
    stem.length > 40 ||
    !/^[A-Za-z0-9][A-Za-z0-9 '\-.]*$/.test(stem)
  ) {
    return "";
  }
  // Escape regex metacharacters that survive the allow-list (' - .).
  return stem.replace(/[.\-]/g, "\\$&").replace(/'/g, "\\'");
}

/** Split "A at B" / "A and B" / "A & B" / "A / B" into cross streets. */
function splitCrossStreets(location: string): [string, string] | null {
  // Handles "[A] and [B]", "[A] at [B]", "[A] at/near the corner of [B]",
  // "[A] corner of [B]", "[A] & [B]", "[A] / [B]", "[A] crossing [B]".
  const m = location
    .replace(/^\s*(?:the\s+)?corner\s+of\s+/i, "") // "corner of A and B" -> "A and B"
    .split(
      /\s+(?:at\s+(?:the\s+)?corner\s+of|near\s+(?:the\s+)?corner\s+of|corner\s+of|crossing|cross(?:es)?|at|and|&|\/|near|@)\s+/i,
    );
  if (m.length === 2 && m[0] && m[1]) return [m[0].trim(), m[1].trim()];
  return null;
}

/** Exact intersection node of two named streets via Overpass (OSM). */
async function overpassIntersection(
  streetA: string,
  streetB: string,
): Promise<{ lat: number; lng: number } | null> {
  const a = streetStem(streetA);
  const b = streetStem(streetB);
  if (!a || !b) return null;
  const query =
    `[out:json][timeout:10];` +
    `way["highway"]["name"~"${a}",i](${LONDON_BBOX})->.w1;` +
    `way["highway"]["name"~"${b}",i](${LONDON_BBOX})->.w2;` +
    `node(w.w1)(w.w2);out 1;`;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(query),
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        elements?: { lat: number; lon: number }[];
      };
      const node = data.elements?.[0];
      if (node && withinLondon(node.lat, node.lon)) {
        return { lat: node.lat, lng: node.lon };
      }
      return null; // valid response, no intersection found — don't retry
    } catch {
      // endpoint busy/down — try the next one
    }
  }
  return null;
}

async function nominatimSearch(
  query: string,
): Promise<{ lat: number; lng: number } | null> {
  const url =
    "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
    encodeURIComponent(query);
  const res = await fetch(url, {
    headers: { "User-Agent": "TowNot/1.0 (fire dispatch geocoder)" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const rows = (await res.json()) as { lat: string; lon: string }[];
  const first = rows[0];
  if (!first) return null;
  const lat = Number.parseFloat(first.lat);
  const lng = Number.parseFloat(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/**
 * Geocode a London ON street/intersection.
 * Chain: Overpass exact intersection node (for cross-streets) -> Nominatim
 * full-string -> per-street Nominatim midpoint (coarse last resort; only
 * accepted when both streets resolve within 3km of each other).
 * All results are sanity-bounded to 25km of London center so same-named
 * streets in other cities can never place a pin.
 */
async function geocodeLondon(
  location: string,
): Promise<{ lat: number; lng: number } | null> {
  const cross = splitCrossStreets(location);

  if (cross) {
    const node = await overpassIntersection(cross[0], cross[1]);
    if (node) return node;
  }

  try {
    const direct = await nominatimSearch(`${location}, London, Ontario, Canada`);
    if (direct && withinLondon(direct.lat, direct.lng)) return direct;
  } catch (err) {
    logger.warn({ err }, "[fire-dispatch] Nominatim direct query failed");
  }

  if (cross) {
    try {
      const a = await nominatimSearch(`${cross[0]}, London, Ontario, Canada`);
      const b = await nominatimSearch(`${cross[1]}, London, Ontario, Canada`);
      if (
        a && b &&
        withinLondon(a.lat, a.lng) &&
        withinLondon(b.lat, b.lng) &&
        distanceKm(a.lat, a.lng, b.lat, b.lng) <= 3
      ) {
        log(`Geocode fallback: midpoint of "${cross[0]}" / "${cross[1]}"`);
        return { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
      }
    } catch (err) {
      logger.warn({ err }, "[fire-dispatch] Nominatim per-street fallback failed");
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Phonetic dictionary + fuzzy street correction                      */
/* ------------------------------------------------------------------ */

/**
 * Whisper routinely garbles London street names over scanner static. Map
 * known misreads to the real street before any geocoding attempt.
 * Keys are matched as whole words, case-insensitively.
 */
const PHONETIC_STREET_FIXES: [RegExp, string][] = [
  [/\bde\s?bron\b/gi, "Deveron"],
  [/\bdevron\b/gi, "Deveron"],
  [/\bdeviron\b/gi, "Deveron"],
  [/\bdev(?:e|a)ran\b/gi, "Deveron"],
  [/\bwharncliff?\b/gi, "Wharncliffe"],
  [/\bwarncliff?e?\b/gi, "Wharncliffe"],
  [/\bhighbry\b/gi, "Highbury"],
  [/\bhi-?berry\b/gi, "Highbury"],
  [/\badelade\b/gi, "Adelaide"],
  [/\bdundass?\b/gi, "Dundas"],
  [/\boxfort\b/gi, "Oxford"],
  [/\bwellingtin\b/gi, "Wellington"],
  [/\bfan?shaw\b/gi, "Fanshawe"],
  [/\bcommissioner'?s?\b/gi, "Commissioners"],
];

/** Common London, ON street names for fuzzy (edit-distance) correction. */
const LONDON_STREETS = [
  "Deveron", "Wharncliffe", "Highbury", "Adelaide", "Dundas", "Oxford",
  "Wellington", "Fanshawe", "Commissioners", "Richmond", "Wonderland",
  "Hamilton", "Huron", "Sarnia", "Western", "Windermere", "Springbank",
  "Southdale", "Exeter", "Colonel Talbot", "Clarke", "Veterans Memorial",
  "Trafalgar", "Gore", "Bradley", "Ernest", "Pond Mills", "Wilton Grove",
  "Sunningdale", "Gainsborough", "Hyde Park", "Byron Baseline", "Riverside",
  "Horton", "York", "King", "Queens", "Cheapside", "Egerton", "Quebec",
  "Florence", "Brydges", "Culver", "Kipps", "Barker", "Cherryhill",
  "Platt's Lane", "Sanatorium", "Boler", "Griffith", "Andover", "Topping",
  "Wistow", "Blackacres", "Fallons", "Old Victoria", "Wickerson", "Jalna",
  "Meadowlily", "Highview", "Homeview", "Berkshire", "Baseline", "Emery",
  "Stanley", "Wortley", "Ridout", "Talbot", "Waterloo", "Colborne",
  "Maitland", "William", "Ontario", "Rectory", "Ashland", "Elizabeth",
  "Central", "Princess", "Dufferin", "Hillcrest", "McCormick", "Vauxhall",
];

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n]!;
}

/** Apply the phonetic misread dictionary to a heard location string. */
function applyPhoneticFixes(location: string): string {
  let fixed = location;
  for (const [re, replacement] of PHONETIC_STREET_FIXES) {
    fixed = fixed.replace(re, replacement);
  }
  return fixed;
}

/**
 * Fuzzy-correct each street-name word against the known London street list.
 * Only fires on close misses (edit distance ≤ 2, and ≤ 1/3 of the name) so
 * genuinely different streets are never rewritten.
 */
function fuzzyCorrectStreets(location: string): string {
  return location.replace(/[A-Za-z][A-Za-z']{3,}/g, (word) => {
    const stemRe =
      /^(north|south|east|west|road|street|avenue|drive|boulevard|line|highway|court|crescent|way|place|and|the)$/i;
    if (stemRe.test(word)) return word;
    let best: { street: string; dist: number } | null = null;
    for (const street of LONDON_STREETS) {
      const dist = levenshtein(word.toLowerCase(), street.toLowerCase());
      if (dist > 0 && (!best || dist < best.dist)) best = { street, dist };
      if (dist === 0) return word; // already an exact street name
    }
    if (best && best.dist <= 2 && best.dist <= Math.ceil(word.length / 3)) {
      log(`Fuzzy street correction: "${word}" -> "${best.street}"`);
      return best.street;
    }
    return word;
  });
}

/* ------------------------------------------------------------------ */
/* Persistence + notification                                         */
/* ------------------------------------------------------------------ */

let incidentStore: IncidentStore | null = null;
let stopFns: Array<() => void> = [];
let started = false;
let processingBusy = false;

/**
 * Recently emitted alertIds and transcript signatures. The rolling overlap
 * deliberately transcribes the same 4 seconds twice, so the same dispatch can
 * surface in two consecutive buffers; these maps collapse it to one incident
 * (and one push) even after the incident store has pruned the row.
 */
const DEDUP_TTL_MS = 30 * 60 * 1000;
const recentAlertIds = new Map<string, number>();
const recentTranscriptSignatures = new Map<string, number>();

function seenRecently(key: string, seen: Map<string, number>): boolean {
  const now = Date.now();
  for (const [existing, at] of seen) {
    if (now - at > DEDUP_TTL_MS) seen.delete(existing);
  }
  if (seen.has(key)) return true;
  seen.set(key, now);
  return false;
}

/** Word-set signature so re-transcribed audio matches despite STT jitter. */
function transcriptSignature(transcript: string): string {
  return [
    ...new Set(
      transcript
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .split(/\s+/)
        .filter((word) => word.length > 2),
    ),
  ]
    .sort()
    .join("-")
    .slice(0, 200);
}

export function attachFireIncidentStore(store: IncidentStore): void {
  incidentStore = store;
}

function severityFromPriority(priority: DispatchPriority): Incident["severity"] {
  if (priority === "critical") return "critical";
  if (priority === "high") return "high";
  return "medium";
}

async function saveAndNotify(
  location: string,
  coords: { lat: number; lng: number },
  keywords: string[],
  transcript: string,
  priority: DispatchPriority,
  unverifiedAddress = false,
): Promise<void> {
  if (!incidentStore) {
    logger.error("[fire-dispatch] incident store is not attached");
    return;
  }
  const now = new Date();
  const normTokens = location
    .toLowerCase()
    .replace(
      /\b(north|south|east|west|road|rd|street|st|avenue|ave|drive|dr|boulevard|blvd|line|highway|hwy|court|crt|crescent|cres|way|place|pl|and|at|the|of)\b/g,
      " ",
    )
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort();
  const timeBucket = Math.floor(now.getTime() / (30 * 60 * 1000));
  const locationSlug =
    (normTokens.length > 0 ? normTokens.join("-").slice(0, 50) : "no-location") +
    `-${timeBucket}`;
  const id = unverifiedAddress
    ? `fire-dispatch-unverified-${locationSlug}`
    : `fire-dispatch-${coords.lat.toFixed(3)},${coords.lng.toFixed(3)}`;
  const existing = incidentStore.getById(id);
  if (!existing && seenRecently(id, recentAlertIds)) {
    log(`DEDUPED: alertId ${id} already dispatched within the last 30min — skipping`);
    return;
  }
  const incident: Incident = {
    id,
    source: "fire_dispatch",
    type: "ACCIDENT",
    subtype: "ACCIDENT_MAJOR",
    title: keywords[0] ? `Fire dispatch · ${keywords[0]}` : "Fire dispatch",
    description:
      `Fire dispatch (${keywords.join(", ")})` +
      (unverifiedAddress ? ` [UNVERIFIED ADDRESS — heard: "${location}"]` : "") +
      `: ${transcript.slice(0, 800)}`,
    coordinates: { latitude: coords.lat, longitude: coords.lng },
    locationLabel: `${location}, London, ON`,
    severity: severityFromPriority(priority),
    timestamp: existing?.timestamp ?? now.toISOString(),
    expiresAt: new Date(now.getTime() + config.incidentTtlMs).toISOString(),
    provider: "london_fire_dispatch",
    unverifiedAddress,
  };
  incidentStore.upsert(incident);
  if (existing) {
    log(
      `DEDUPED: dispatch at "${location}" refreshed existing fire-dispatch row ${id} — no re-notify`,
    );
  } else {
    log(
      `SAVED crash dispatch at "${location}" (${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)})`,
    );
  }
}

/* ------------------------------------------------------------------ */
/* Buffer pipeline                                                    */
/* ------------------------------------------------------------------ */

async function processBuffer(tsChunks: Buffer[]): Promise<void> {
  const wav = await tsToWav(Buffer.concat(tsChunks));
  await processWav(wav);
}

async function processWav(wav: Buffer): Promise<void> {
  const level = wavRmsDbfs(wav);
  if (level < SILENCE_RMS_DBFS) {
    log(`STT skipped: dead air (${level.toFixed(1)} dBFS)`);
    return;
  }

  const started = Date.now();
  const transcript = (await speechToText(wav)).trim();
  log(
    `STT complete in ${Date.now() - started}ms: ${Math.round((wav.length - 44) / 32000)}s audio -> ${transcript.length} chars`,
  );
  if (transcript.length < 5) return;
  log(`Transcript: ${transcript.slice(0, 200)}`);

  const keywords = findCrashKeywords(transcript);
  if (keywords.length === 0) return;
  if (seenRecently(transcriptSignature(transcript), recentTranscriptSignatures)) {
    log("DEDUPED: overlapping buffer re-transcribed an already-processed dispatch");
    return;
  }
  const priority = classifyPriority(transcript);
  log(
    `Crash keywords hit [${keywords.join(", ")}] priority=${priority} — extracting location`,
  );

  // MANDATORY POST RULE: from here on, a crash-keyword transcript is ALWAYS
  // saved and notified — location/geocode failures degrade to fallback
  // coordinates with unverifiedAddress=true, never to a dropped call.
  const heard = await extractLocation(transcript).catch((err) => {
    logger.warn({ err }, "[fire-dispatch] location extraction failed — posting unpinned");
    return null;
  });

  let location = heard ? applyPhoneticFixes(heard) : null;
  if (location && location !== heard) {
    log(`Phonetic fix: "${heard}" -> "${location}"`);
  }

  let coords: { lat: number; lng: number } | null = null;
  let unverifiedAddress = false;

  if (location) {
    log(`New call parsed: ${keywords[0]} at ${location} (priority=${priority})`);
    coords = await geocodeLondon(location).catch(() => null);
    if (!coords) {
      // Fuzzy street-name correction, then one geocode retry.
      const corrected = fuzzyCorrectStreets(location);
      if (corrected !== location) {
        coords = await geocodeLondon(corrected).catch(() => null);
        if (coords) location = corrected;
      }
    }
  } else {
    log("No street/intersection heard — posting with fallback coordinates");
  }

  if (!coords) {
    coords = { ...LONDON_FALLBACK_COORDS };
    unverifiedAddress = true;
    log(
      `Geocoding unavailable for "${location ?? "<no location heard>"}" — saving with fallback coords (unverified address)`,
    );
  }

  await saveAndNotify(
    location ?? "Location unverified (heard on radio)",
    coords,
    keywords,
    transcript,
    priority,
    unverifiedAddress,
  );
}

/* ------------------------------------------------------------------ */
/* Direct-stream capture (RADIO_HLS_URL pointing at a live stream)    */
/* ------------------------------------------------------------------ */

/**
 * Capture one buffer-length chunk of audio straight from a live stream URL
 * (Broadcastify shoutcast/MP3 or any URL ffmpeg can read). Reconnect flags
 * ride out transient stalls/drops inside a single capture; corrupted frames
 * are tolerated by ffmpeg's error concealment and never throw here unless
 * the whole capture produced nothing.
 */
function captureDirectStream(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", [
      "-hide_banner",
      "-loglevel", "error",
      "-reconnect", "1",
      "-reconnect_at_eof", "1",
      "-reconnect_streamed", "1",
      "-reconnect_delay_max", "5",
      "-user_agent", UA,
      "-headers", `Referer: ${STREAM_REFERER}\r\n`,
      "-i", url,
      "-t", String(BUFFER_TARGET_SECONDS),
      "-ac", "1",
      "-ar", "16000",
      "-f", "wav",
      "pipe:1",
    ]);
    const MAX_WAV_BYTES = 16 * 1024 * 1024;
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
    // Capture must finish within buffer length + generous connect margin.
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
      if (outBytes > MAX_WAV_BYTES) {
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
        // ffmpeg may exit non-zero after a mid-capture drop yet still have
        // produced usable audio — accept anything longer than 1 second.
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

/**
 * Continuous capture loop for direct-stream mode. Never throws: every
 * failure (stall, corrupt frames, dropped connection) is logged and retried
 * after a short backoff against the same RADIO_HLS_URL.
 */
function startDirectStreamLoop(url: string, fallbackToHls: () => void): void {
  log(
    `Direct-stream mode: capturing ${BUFFER_TARGET_SECONDS}s chunks from RADIO_HLS_URL with ffmpeg reconnect enabled`,
  );
  // If the direct URL never produces audio (host unreachable, auth wall,
  // dead stream), stop burning retries and revert to the built-in HLS
  // poller so ingestion continues. Only fires if NO capture ever succeeded.
  const FALLBACK_AFTER_FAILURES = 5;
  let consecutiveFailures = 0;
  let everSucceeded = false;
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  const schedule = (ms: number): void => {
    if (stopped) return;
    timer = setTimeout(loop, ms);
  };
  stopFns.push(() => {
    stopped = true;
    if (timer) clearTimeout(timer);
  });
  const runOnce = async (): Promise<void> => {
    const wav = await captureDirectStream(url);
    consecutiveFailures = 0;
    everSucceeded = true;
    await processWav(wav);
  };
  const loop = (): void => {
    if (stopped) return;
    void runOnce()
      .then(() => schedule(250)) // immediately capture the next chunk
      .catch((err) => {
        consecutiveFailures++;
        if (!everSucceeded && consecutiveFailures >= FALLBACK_AFTER_FAILURES) {
          logger.error(
            { err },
            `[fire-dispatch] direct-stream URL unreachable after ${consecutiveFailures} attempts — ` +
              `falling back to built-in HLS poller. Fix or remove RADIO_HLS_URL (${url}).`,
          );
          stopped = true;
          fallbackToHls();
          return;
        }
        const backoffMs = Math.min(30_000, 2_000 * consecutiveFailures);
        logger.warn(
          { err, consecutiveFailures },
          `[fire-dispatch] direct-stream capture failed — retrying in ${backoffMs / 1000}s`,
        );
        schedule(backoffMs);
      });
  };
  loop();
}

/* ------------------------------------------------------------------ */
/* Main poll loop                                                     */
/* ------------------------------------------------------------------ */

async function pollOnce(state: StreamState): Promise<void> {
  let playlistText: string;
  try {
    playlistText = await fetchText(state.hlsUrl);
    state.consecutiveFailures = 0;
  } catch (err) {
    state.consecutiveFailures++;
    logger.warn(
      { err, failures: state.consecutiveFailures },
      "[fire-dispatch] playlist fetch failed",
    );
    // Path token may have rotated — rediscover from the player page after a
    // few straight failures.
    if (state.consecutiveFailures >= 3) {
      const fresh = await rediscoverHlsUrl();
      if (fresh) {
        state.hlsUrl = fresh;
        state.consecutiveFailures = 0;
      }
    }
    return;
  }

  const segments = parsePlaylist(playlistText, state.hlsUrl);

  // First poll: baseline to the current live edge instead of replaying the
  // whole window. Sequence regression (Broadcastify rotates/restarts the
  // playlist, which can reset media sequence numbers): rebase to the new
  // numbering minus the live window so ingestion continues instead of
  // silently ignoring every segment forever.
  const newest = segments[segments.length - 1];
  if (newest) {
    if (state.lastSequence < 0) {
      state.lastSequence = newest.sequence - 1; // start with the latest segment
    } else if (newest.sequence < state.lastSequence) {
      log(
        `HLS media sequence regressed (${state.lastSequence} -> ${newest.sequence}); rebasing`,
      );
      state.lastSequence = newest.sequence - 1;
    }
  }

  const fresh = segments.filter((s) => s.sequence > state.lastSequence);
  for (const seg of fresh) {
    try {
      const data = await fetchBinary(seg.url);
      pushSegment(state, data, seg.seconds);
      state.lastSequence = seg.sequence;
      state.lastAudioAt = Date.now();
    } catch (err) {
      logger.warn({ err, url: seg.url }, "[fire-dispatch] segment fetch failed");
      state.lastSequence = seg.sequence; // don't refetch a dead segment forever
    }
  }

  if (readyToFlush(state) && !processingBusy) {
    const chunk = takeFlushChunk(state);
    // Fire-and-forget with a single-flight guard: STT/LLM/geocode can take
    // minutes, and awaiting it here would block segment fetching (starving
    // lastAudioAt and tripping the silence watchdog on a healthy stream).
    processingBusy = true;
    void processBuffer(chunk)
      .catch((err) =>
        logger.error({ err }, "[fire-dispatch] buffer processing failed"),
      )
      .finally(() => {
        processingBusy = false;
      });
  } else if (state.pending.length > MAX_BUFFERED_SEGMENTS * 3) {
    // Processor stuck for multiple buffer windows — shed the oldest audio
    // rather than growing memory without bound.
    const dropped = shedOldestSegments(state);
    log(`processor busy too long — dropped ${dropped} oldest buffered segment(s)`);
  }
}

export function startLondonFireListener(): void {
  if (started) return;
  started = true;

  let probeFailed = false;
  const probe = spawn("ffmpeg", ["-version"]);
  probe.on("error", () => {
    probeFailed = true;
    // Leave the listener stoppable/restartable rather than wedged as started.
    started = false;
    logger.error(
      "[fire-dispatch] ffmpeg not found in PATH — audio listener disabled. Republish after registering ffmpeg as a system dependency.",
    );
  });
  probe.on("close", (code) => {
    if (probeFailed) return;
    if (code === 0) {
      startPolling();
      return;
    }
    started = false;
    logger.error({ code }, "[fire-dispatch] ffmpeg probe failed — audio listener disabled");
  });
}

export function isFireListenerRunning(): boolean {
  return started;
}

export function stopLondonFireListener(): void {
  started = false;
  for (const stop of stopFns) stop();
  stopFns = [];
}

function startPolling(): void {
  const envUrl = config.radioHlsUrl.trim();
  if (envUrl && !/\.m3u8(\?|$)/i.test(envUrl)) {
    // Non-playlist URL (e.g. Broadcastify shoutcast/MP3 stream): capture it
    // directly with ffmpeg instead of the HLS segment poller. If the host
    // proves unreachable from this environment, we fall back to the
    // built-in HLS poller automatically (see startDirectStreamLoop).
    log(`Using RADIO_HLS_URL override (direct stream): ${envUrl}`);
    startDirectStreamLoop(envUrl, () => startHlsPolling(DEFAULT_HLS_URL));
    return;
  }
  if (envUrl) {
    log(`Using RADIO_HLS_URL override (HLS playlist): ${envUrl}`);
  } else {
    logger.warn(
      `[fire-dispatch] RADIO_HLS_URL not set — using built-in Broadcastify feed ${FEED_ID} URL with auto-rediscovery. ` +
        `To pin a stream explicitly, set the secret: RADIO_HLS_URL=${DEFAULT_HLS_URL}`,
    );
  }
  startHlsPolling(envUrl || DEFAULT_HLS_URL);
}

function startHlsPolling(hlsUrl: string): void {
  const state: StreamState = {
    ...createAudioBufferState(),
    hlsUrl,
    lastSequence: -1, // <0 = not yet baselined to the live edge
    consecutiveFailures: 0,
    lastAudioAt: Date.now(),
  };

  log(
    `Listener starting: Broadcastify feed ${FEED_ID} (London Fire and Public Works), ` +
      `${BUFFER_TARGET_SECONDS}s buffers, poll every ${POLL_INTERVAL_MS / 1000}s`,
  );

  let inFlight = false;
  const pollTimer = setInterval(() => {
    if (inFlight) return;
    inFlight = true;
    void pollOnce(state)
      .catch((err) =>
        logger.warn({ err }, "[fire-dispatch] poll pass failed — retrying next cycle"),
      )
      .finally(() => {
        inFlight = false;
      });
  }, POLL_INTERVAL_MS);

  const WATCHDOG_SILENCE_MS = 2 * 60 * 1000;
  const watchdogTimer = setInterval(() => {
    const silentMs = Date.now() - state.lastAudioAt;
    if (silentMs < WATCHDOG_SILENCE_MS) return;
    log(
      `WATCHDOG: no audio for ${Math.round(silentMs / 1000)}s (>120s) — restarting stream listener`,
    );
    // Reset immediately so a slow rediscovery doesn't re-trigger every tick.
    state.lastAudioAt = Date.now();
    resetAudioBuffer(state);
    state.lastSequence = -1; // rebaseline to live edge on next poll
    state.consecutiveFailures = 0;
    void rediscoverHlsUrl()
      .then((fresh) => {
        if (fresh) {
          state.hlsUrl = fresh;
          log(`WATCHDOG: rediscovered fresh HLS URL`);
        } else {
          log(`WATCHDOG: HLS rediscovery failed — keeping current URL`);
        }
      })
      .catch((err) =>
        logger.warn({ err }, "[fire-dispatch] watchdog rediscovery failed"),
      );
  }, 30 * 1000);
  stopFns.push(() => {
    clearInterval(pollTimer);
    clearInterval(watchdogTimer);
  });
}

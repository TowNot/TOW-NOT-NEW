import { saveFireDispatchAudio } from "../../audioStorage";
import { config } from "../../config";
import { logger } from "../pinoCompat";
import {
  applyPhoneticFixes,
  extractDispatchLocation,
  fuzzyCorrectStreets,
} from "../dispatchLocation";
import {
  classifyPriority,
  findCrashKeywords,
  findNegativeKeywords,
  type DispatchPriority,
} from "../dispatchKeywords";
import { speechToText } from "../deepgramClient";
import { getCoverageZone } from "../zones.config";
import type { Incident } from "../../types/incident";
import type { IncidentStore } from "../../store/incidentStore";

export type FireAudioSourceType = "stream" | "calls";

export interface FireDispatchContext {
  zoneId: string;
  sourceType: FireAudioSourceType;
  label: string;
}

export function sourceTagLabel(sourceType: FireAudioSourceType): string {
  return sourceType === "stream" ? "[Stream]" : "[Calls]";
}

const SILENCE_RMS_DBFS = -50;
const DEDUP_TTL_MS = 30 * 60 * 1000;

function zoneCenter(zoneId: string): { lat: number; lng: number } {
  const zone = getCoverageZone(zoneId);
  if (!zone) return { lat: 43.65, lng: -79.38 };
  const { southWest, northEast } = zone.bounds;
  return {
    lat: (southWest.lat + northEast.lat) / 2,
    lng: (southWest.lng + northEast.lng) / 2,
  };
}

/** Cross-source A/B latency benchmark keyed by dispatch location slug. */
const crossSourceArrivals = new Map<
  string,
  Partial<Record<FireAudioSourceType, number>>
>();

function locationSlug(location: string, timeBucket: number): string {
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
  return (
    (normTokens.length > 0 ? normTokens.join("-").slice(0, 50) : "no-location") +
    `-${timeBucket}`
  );
}

function recordCrossSourceLatency(
  slug: string,
  sourceType: FireAudioSourceType,
  atMs: number,
): void {
  const entry = crossSourceArrivals.get(slug) ?? {};
  const prior = entry[sourceType];
  if (prior && atMs - prior < DEDUP_TTL_MS) return;
  entry[sourceType] = atMs;
  crossSourceArrivals.set(slug, entry);

  const other: FireAudioSourceType = sourceType === "stream" ? "calls" : "stream";
  const otherAt = entry[other];
  if (!otherAt) return;

  const deltaMs = Math.abs(atMs - otherAt);
  const deltaSec = (deltaMs / 1000).toFixed(2);
  const first = atMs < otherAt ? sourceType : other;
  const second = first === "stream" ? "calls" : "stream";
  logger.info(
    `[fire-dispatch] A/B latency: ${first} arrived ${deltaSec}s before ${second} for "${slug.replace(/-\d+$/, "")}"`,
  );
}

function wavRmsDbfs(wav: Buffer): number {
  if (wav.length <= 44) return -100;
  const samples = wav.subarray(44);
  let sumSq = 0;
  const count = Math.floor(samples.length / 2);
  if (count === 0) return -100;
  for (let i = 0; i < count; i++) {
    const sample = samples.readInt16LE(i * 2) / 32768;
    sumSq += sample * sample;
  }
  const rms = Math.sqrt(sumSq / count);
  return 20 * Math.log10(rms || 1e-9);
}

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

function severityFromPriority(priority: DispatchPriority): Incident["severity"] {
  if (priority === "critical") return "critical";
  if (priority === "high") return "high";
  return "medium";
}

async function geocodeZoneLocation(
  zoneId: string,
  location: string,
): Promise<{ lat: number; lng: number } | null> {
  const zone = getCoverageZone(zoneId);
  const city = zone?.name ?? "Ontario";
  const q = encodeURIComponent(`${location}, ${city}, Ontario, Canada`);
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
    { headers: { "User-Agent": "AlertNav-FireDispatch/1.0" } },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ lat?: string; lon?: string }>;
  const hit = rows[0];
  if (!hit?.lat || !hit.lon) return null;
  const lat = Number(hit.lat);
  const lng = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export class FireDispatchProcessor {
  private readonly recentAlertIds = new Map<string, number>();
  private readonly recentTranscriptSignatures = new Map<string, number>();

  constructor(
    private readonly ctx: FireDispatchContext,
    private readonly incidentStore: IncidentStore | null,
  ) {}

  private seenRecently(key: string, seen: Map<string, number>): boolean {
    const now = Date.now();
    for (const [existing, at] of seen) {
      if (now - at > DEDUP_TTL_MS) seen.delete(existing);
    }
    if (seen.has(key)) return true;
    seen.set(key, now);
    return false;
  }

  async processWav(wav: Buffer): Promise<void> {
    const level = wavRmsDbfs(wav);
    if (level < SILENCE_RMS_DBFS) {
      logger.debug(
        `[fire-dispatch] ${this.ctx.label} STT skipped: dead air (${level.toFixed(1)} dBFS)`,
      );
      return;
    }

    const startedAt = Date.now();
    const transcript = (await speechToText(wav)).trim();
    logger.debug(
      {
        source: this.ctx.sourceType,
        chars: transcript.length,
        preview: transcript.slice(0, 160),
      },
      "[FIRE SCANNER] Transcription received",
    );
    logger.debug(
      `[fire-dispatch] ${this.ctx.label} STT complete in ${Date.now() - startedAt}ms`,
    );

    await this.processTranscript(transcript, wav);
  }

  async processTranscript(transcript: string, wav?: Buffer): Promise<void> {
    if (transcript.length < 5) return;

    const sigKey = `${this.ctx.sourceType}:${transcriptSignature(transcript)}`;
    if (this.seenRecently(sigKey, this.recentTranscriptSignatures)) {
      logger.info(
        `[fire-dispatch] ${this.ctx.label} DEDUPED: overlapping transcript within same source`,
      );
      return;
    }

    const keywords = findCrashKeywords(transcript);
    if (keywords.length === 0) {
      const blocked = findNegativeKeywords(transcript);
      if (blocked.length > 0) {
        logger.debug(
          `[fire-dispatch] ${this.ctx.label} DROPPED: blacklist hit [${blocked.join(", ")}]`,
        );
      }
      return;
    }

    const priority = classifyPriority(transcript);
    const heard = extractDispatchLocation(transcript);
    let location = heard ? applyPhoneticFixes(heard) : null;
    let coords: { lat: number; lng: number } | null = null;
    let unverifiedAddress = false;

    if (location) {
      coords = await geocodeZoneLocation(this.ctx.zoneId, location).catch(() => null);
      if (!coords) {
        const corrected = fuzzyCorrectStreets(location);
        if (corrected !== location) {
          coords = await geocodeZoneLocation(this.ctx.zoneId, corrected).catch(() => null);
          if (coords) location = corrected;
        }
      }
    }

    if (!coords) {
      coords = { ...zoneCenter(this.ctx.zoneId) };
      unverifiedAddress = true;
    }

    await this.saveAndNotify(
      location ?? "Location unverified (heard on radio)",
      coords,
      keywords,
      transcript,
      priority,
      unverifiedAddress,
      wav,
    );
  }

  private async saveAndNotify(
    location: string,
    coords: { lat: number; lng: number },
    keywords: string[],
    transcript: string,
    priority: DispatchPriority,
    unverifiedAddress: boolean,
    wav?: Buffer,
  ): Promise<void> {
    if (!this.incidentStore) {
      logger.error("[fire-dispatch] incident store is not attached");
      return;
    }

    const now = new Date();
    const timeBucket = Math.floor(now.getTime() / (30 * 60 * 1000));
    const slug = locationSlug(location, timeBucket);
    const sourceTag = sourceTagLabel(this.ctx.sourceType);
    const id = unverifiedAddress
      ? `fire-dispatch-${this.ctx.sourceType}-unverified-${slug}`
      : `fire-dispatch-${this.ctx.sourceType}-${coords.lat.toFixed(3)},${coords.lng.toFixed(3)}-${timeBucket}`;

    if (!this.incidentStore.getById(id) && this.seenRecently(id, this.recentAlertIds)) {
      logger.info(
        `[fire-dispatch] ${this.ctx.label} DEDUPED: alertId ${id} already dispatched within 30min`,
      );
      return;
    }

    recordCrossSourceLatency(slug, this.ctx.sourceType, now.getTime());

    let audioUrl = this.incidentStore.getById(id)?.audioUrl;
    if (wav && wav.length > 44 && !audioUrl) {
      try {
        audioUrl = await saveFireDispatchAudio(wav, id);
      } catch (err) {
      logger.warn({ err, id }, "[fire-dispatch] failed to persist dispatch audio clip");
      }
    }

    const zoneName = getCoverageZone(this.ctx.zoneId)?.name ?? "Ontario";
    const existing = this.incidentStore.getById(id);
    const incident: Incident = {
      id,
      source: "fire_dispatch",
      type: "ACCIDENT",
      subtype: "ACCIDENT_MAJOR",
      title: `${sourceTag} ${keywords[0] ? `Fire dispatch · ${keywords[0]}` : "Fire dispatch"}`,
      description:
        `${sourceTag} Fire dispatch (${keywords.join(", ")})` +
        (unverifiedAddress ? ` [UNVERIFIED ADDRESS — heard: "${location}"]` : "") +
        `: ${transcript.slice(0, 800)}`,
      coordinates: { latitude: coords.lat, longitude: coords.lng },
      locationLabel: `${location}, ${zoneName}, ON`,
      severity: severityFromPriority(priority),
      timestamp: existing?.timestamp ?? now.toISOString(),
      expiresAt: new Date(now.getTime() + config.incidentTtlMs).toISOString(),
      provider: `${this.ctx.zoneId}_fire_dispatch_${this.ctx.sourceType}`,
      unverifiedAddress,
      audioUrl,
    };

    this.incidentStore.upsert(incident);

    if (existing) {
      logger.info(
        `[fire-dispatch] ${this.ctx.label} DEDUPED: refreshed existing row ${id} — no re-notify`,
      );
    } else {
      logger.info(
        `[fire-dispatch] ${this.ctx.label} SAVED crash dispatch at "${location}" (${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)})`,
      );
    }
  }
}

let sharedStore: IncidentStore | null = null;

export function attachFireDispatchStore(store: IncidentStore): void {
  sharedStore = store;
}

export function createFireDispatchProcessor(ctx: FireDispatchContext): FireDispatchProcessor {
  return new FireDispatchProcessor(ctx, sharedStore);
}

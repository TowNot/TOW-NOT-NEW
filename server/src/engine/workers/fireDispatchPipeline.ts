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
  findEmsKeywords,
  findNegativeKeywords,
  type DispatchPriority,
} from "../dispatchKeywords";
import { speechToText } from "../deepgramClient";
import { getCoverageZone } from "../zones.config";
import type { Incident, IncidentSource } from "../../types/incident";
import type { IncidentStore } from "../../store/incidentStore";
import {
  noteFireDispatchPosted,
  noteFireDispatchSkip,
  noteFireDispatchTranscript,
} from "./fireDispatchRuntime";

export type FireAudioSourceType = "hls" | "stream";

export interface FireDispatchContext {
  zoneId: string;
  sourceType: FireAudioSourceType;
  label: string;
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
      noteFireDispatchSkip(`dead_air:${level.toFixed(1)}dBFS`);
      logger.debug(
        `[fire-dispatch] ${this.ctx.label} STT skipped: dead air (${level.toFixed(1)} dBFS)`,
      );
      return;
    }

    const startedAt = Date.now();
    const transcript = (await speechToText(wav)).trim();
    noteFireDispatchTranscript(transcript);
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
    if (transcript.length < 5) {
      noteFireDispatchSkip("empty_transcript");
      return;
    }

    const sigKey = `${this.ctx.zoneId}:${transcriptSignature(transcript)}`;
    if (this.seenRecently(sigKey, this.recentTranscriptSignatures)) {
      logger.info(
        `[fire-dispatch] ${this.ctx.label} DEDUPED: overlapping transcript`,
      );
      return;
    }

    // Fire crash path first (unchanged). EMS only when no crash hit and the
    // zone's stream includes EMS (CYKF Waterloo Region).
    const crashKeywords = findCrashKeywords(transcript);
    const zone = getCoverageZone(this.ctx.zoneId);
    const emsKeywords =
      crashKeywords.length === 0 && zone?.hasEmsFeed
        ? findEmsKeywords(transcript)
        : [];

    if (crashKeywords.length === 0 && emsKeywords.length === 0) {
      const blocked = findNegativeKeywords(transcript);
      if (blocked.length > 0) {
        noteFireDispatchSkip(`negative_keyword:${blocked.join(",")}`);
        logger.debug(
          `[fire-dispatch] ${this.ctx.label} DROPPED: blacklist hit [${blocked.join(", ")}]`,
        );
      } else {
        noteFireDispatchSkip("no_keyword");
      }
      return;
    }

    const agency: "fire" | "ems" = crashKeywords.length > 0 ? "fire" : "ems";
    const keywords = agency === "fire" ? crashKeywords : emsKeywords;
    const priority =
      agency === "fire" ? classifyPriority(transcript) : "high";
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
      agency,
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
    agency: "fire" | "ems",
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
    const source: IncidentSource = agency === "ems" ? "ems" : "fire_dispatch";
    const idPrefix = agency === "ems" ? "ems" : "fire-dispatch";
    const providerSuffix = agency === "ems" ? "ems" : "fire_dispatch";
    const id = unverifiedAddress
      ? `${idPrefix}-${this.ctx.zoneId}-unverified-${slug}`
      : `${idPrefix}-${this.ctx.zoneId}-${coords.lat.toFixed(3)},${coords.lng.toFixed(3)}-${timeBucket}`;

    if (!this.incidentStore.getById(id) && this.seenRecently(id, this.recentAlertIds)) {
      logger.info(
        `[fire-dispatch] ${this.ctx.label} DEDUPED: alertId ${id} already dispatched within 30min`,
      );
      return;
    }

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
    const titlePrefix = agency === "ems" ? "EMS" : "Fire dispatch";
    const typeLabel = agency === "ems" ? "EMS" : "Fire dispatch";
    const incident: Incident = {
      id,
      source,
      type: agency === "ems" ? "EMS" : "ACCIDENT",
      subtype: agency === "ems" ? "EMS_CALL" : "ACCIDENT_MAJOR",
      title: keywords[0] ? `${titlePrefix} · ${keywords[0]}` : titlePrefix,
      description:
        `${typeLabel} (${keywords.join(", ")})` +
        (unverifiedAddress ? ` [UNVERIFIED ADDRESS — heard: "${location}"]` : "") +
        `: ${transcript.slice(0, 800)}`,
      coordinates: { latitude: coords.lat, longitude: coords.lng },
      locationLabel: `${location}, ${zoneName}, ON`,
      severity: severityFromPriority(priority),
      timestamp: existing?.timestamp ?? now.toISOString(),
      expiresAt: new Date(now.getTime() + config.incidentTtlMs).toISOString(),
      provider: `${this.ctx.zoneId}_${providerSuffix}`,
      unverifiedAddress,
      audioUrl,
    };

    this.incidentStore.upsert(incident);
    noteFireDispatchPosted();

    if (existing) {
      logger.info(
        `[fire-dispatch] ${this.ctx.label} DEDUPED: refreshed existing row ${id} — no re-notify`,
      );
    } else {
      logger.info(
        `[fire-dispatch] ${this.ctx.label} SAVED ${agency} dispatch at "${location}" (${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)})`,
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

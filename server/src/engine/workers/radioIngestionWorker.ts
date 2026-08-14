import { spawn } from "node:child_process";
import { config } from "../../config";
import { logger } from "../../logger";
import { IncidentStore } from "../../store/incidentStore";
import type { Incident } from "../../types/incident";
import { jitter, pickLocation } from "../londonLocations";
import { stableId } from "../../util/ids";

export interface TranscriptionProvider {
  transcribe(audioChunk: Buffer, mimeType?: string): Promise<string>;
}

export class StubTranscriptionProvider implements TranscriptionProvider {
  async transcribe(_audioChunk: Buffer, _mimeType = "audio/mpeg"): Promise<string> {
    const scripts = [
      "Engine 5, Engine 9, Rescue 2, respond to structure fire, 450 Richmond Street.",
      "Ladder 1, Engine 3, medical assist, possible MVC with entrapment, Wellington and Commissioners.",
      "Engine 7, alarm ringing, commercial occupancy, 1200 Wonderland Road South.",
      "Rescue 4, Engine 2, vehicle fire, Highway 401 westbound at Highbury.",
      "Engine 11, dumpster fire, Adelaide and Dundas, police on scene.",
    ];
    return scripts[Math.floor(Math.random() * scripts.length)];
  }
}

export function buildFfmpegHlsCaptureArgs(streamUrl: string, outputPath: string): string[] {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    streamUrl,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-f",
    "segment",
    "-segment_time",
    "15",
    "-reset_timestamps",
    "1",
    outputPath,
  ];
}

export function parseDispatchTranscript(transcript: string): Omit<Incident, "id" | "timestamp" | "expiresAt"> | null {
  const lowered = transcript.toLowerCase();
  let type = "dispatch";
  let title = "Fire dispatch";
  let severity: Incident["severity"] = "medium";

  if (lowered.includes("structure fire")) {
    type = "structure_fire";
    title = "Structure fire";
    severity = "critical";
  } else if (lowered.includes("vehicle fire")) {
    type = "vehicle_fire";
    title = "Vehicle fire";
    severity = "high";
  } else if (lowered.includes("mvc") || lowered.includes("entrapment")) {
    type = "mvc";
    title = "MVC with entrapment";
    severity = "critical";
  } else if (lowered.includes("alarm")) {
    type = "fire_alarm";
    title = "Fire alarm";
    severity = "medium";
  } else if (lowered.includes("dumpster")) {
    type = "outside_fire";
    title = "Outside fire";
    severity = "low";
  }

  const addressMatch = transcript.match(/(?:respond to|occupancy,|fire,|assist,)\s*([^,]+(?:,[^,]+)?)/i);
  const seed = transcript.length + title.length;
  const fallback = pickLocation(seed);
  const extracted = addressMatch?.[1]?.trim().replace(/[.,]+$/, "");
  const locationLabel = extracted
    ? `${extracted}, London, ON`
    : `${fallback.label}, London, ON`;

  return {
    source: "fire_dispatch",
    type,
    title,
    description: transcript.trim(),
    coordinates: {
      latitude: jitter(fallback.latitude),
      longitude: jitter(fallback.longitude),
    },
    locationLabel,
    severity,
  };
}

export class RadioIngestionWorker {
  private timer: NodeJS.Timeout | null = null;
  private ffmpeg: ReturnType<typeof spawn> | null = null;

  constructor(
    private readonly store: IncidentStore,
    private readonly transcription: TranscriptionProvider = new StubTranscriptionProvider(),
  ) {}

  start(): void {
    if (this.timer) return;
    logger.info("Live radio ingestion worker started", {
      hlsConfigured: Boolean(config.radioHlsUrl),
      intervalMs: config.pollIntervalMs,
    });

    if (config.radioHlsUrl) {
      this.startFfmpegCapture(config.radioHlsUrl);
    }

    void this.ingestCycle();
    this.timer = setInterval(() => void this.ingestCycle(), config.pollIntervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.ffmpeg) {
      this.ffmpeg.kill("SIGTERM");
      this.ffmpeg = null;
    }
  }

  buildCaptureArgs(streamUrl: string, outputPath = "radio-chunks/chunk-%03d.wav"): string[] {
    return buildFfmpegHlsCaptureArgs(streamUrl, outputPath);
  }

  async transcribeChunk(audioChunk: Buffer): Promise<string> {
    return this.transcription.transcribe(audioChunk);
  }

  async ingestCycle(): Promise<Incident | null> {
    const silentChunk = Buffer.alloc(0);
    const transcript = await this.transcribeChunk(silentChunk);
    const parsed = parseDispatchTranscript(transcript);
    if (!parsed) return null;

    const now = Date.now();
    const incident: Incident = {
      ...parsed,
      id: stableId("fire_dispatch", `${parsed.type}:${parsed.locationLabel}`),
      timestamp: new Date(now).toISOString(),
      expiresAt: new Date(now + config.incidentTtlMs).toISOString(),
    };
    this.store.upsert(incident);
    logger.debug("Radio ingest cycle complete", { incidentId: incident.id, type: incident.type });
    return incident;
  }

  private startFfmpegCapture(streamUrl: string): void {
    const args = this.buildCaptureArgs(streamUrl);
    logger.info("Spawning FFmpeg HLS capture", { args });
    try {
      this.ffmpeg = spawn("ffmpeg", args, { stdio: "ignore" });
      this.ffmpeg.on("error", (error) => {
        logger.warn("FFmpeg capture unavailable; continuing with transcription stubs", {
          error: error.message,
        });
        this.ffmpeg = null;
      });
      this.ffmpeg.on("exit", (code) => {
        logger.warn("FFmpeg capture exited", { code });
        this.ffmpeg = null;
      });
    } catch (error) {
      logger.warn("Failed to spawn FFmpeg", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/**
 * Parallel STT bake-off helpers for AssemblyAI + Speechmatics.
 * Failures here must never throw into the Deepgram fire-dispatch path.
 */
import { config } from "../config";
import { logger } from "./pinoCompat";

export type SttBakeOffProvider = "dg" | "aai" | "sm";

export const STT_PUSH_PREFIX: Record<SttBakeOffProvider, string> = {
  dg: "[DG]",
  aai: "[AAI]",
  sm: "[SM]",
};

const BAKE_OFF_TIMEOUT_MS = 20_000;
const PCM_CHUNK_BYTES = 3200; // 100ms @ 16kHz mono s16le

/** Strip a standard WAV header; our ffmpeg path emits 44-byte PCM WAV. */
export function pcmFromWav(wav: Buffer): Buffer {
  if (wav.length <= 44) return Buffer.alloc(0);
  return wav.subarray(44);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Universal-3.5 Pro Realtime via AssemblyAI WebSocket streaming.
 * Returns the last finalized turn transcript for this closed buffer.
 */
export async function speechToTextAssemblyAi(wav: Buffer): Promise<string> {
  if (!config.assemblyAiApiKey) {
    throw new Error("ASSEMBLYAI_API_KEY is not configured");
  }
  const pcm = pcmFromWav(wav);
  if (pcm.length === 0) return "";

  // Dynamic import keeps cold-start / missing-key paths light.
  const { AssemblyAI } = await import("assemblyai");
  const client = new AssemblyAI({ apiKey: config.assemblyAiApiKey });
  const transcriber = client.streaming.transcriber({
    speechModel: "universal-3-5-pro",
    sampleRate: 16_000,
    formatTurns: true,
  });

  let lastFinal = "";
  let lastPartial = "";

  return withTimeout(
    (async () => {
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const settle = (fn: () => void) => {
          if (settled) return;
          settled = true;
          fn();
        };

        transcriber.on("turn", (event) => {
          const text = (event.transcript ?? "").trim();
          if (!text) return;
          if (event.end_of_turn) lastFinal = text;
          else lastPartial = text;
        });
        transcriber.on("error", (err) => settle(() => reject(err)));
        transcriber.on("close", () => settle(() => resolve()));

        void (async () => {
          try {
            await transcriber.connect();
            for (let offset = 0; offset < pcm.length; offset += PCM_CHUNK_BYTES) {
              const chunk = pcm.subarray(offset, offset + PCM_CHUNK_BYTES);
              const copy = chunk.buffer.slice(
                chunk.byteOffset,
                chunk.byteOffset + chunk.byteLength,
              );
              transcriber.sendAudio(copy);
            }
            try {
              transcriber.forceEndpoint();
            } catch {
              /* optional mid-stream flush */
            }
            // Brief settle so the final Turn can arrive before Terminate.
            await new Promise((r) => setTimeout(r, 400));
            await transcriber.close();
            settle(() => resolve());
          } catch (err) {
            try {
              await transcriber.close();
            } catch {
              /* ignore close errors after failure */
            }
            settle(() => reject(err));
          }
        })();
      });

      return (lastFinal || lastPartial).trim();
    })(),
    BAKE_OFF_TIMEOUT_MS,
    "AssemblyAI",
  );
}

/**
 * Speechmatics Real-time Enhanced model via WebSocket.
 * Streams the closed WAV as a recognized file container.
 */
export async function speechToTextSpeechmatics(wav: Buffer): Promise<string> {
  if (!config.speechmaticsApiKey) {
    throw new Error("SPEECHMATICS_API_KEY is not configured");
  }
  if (wav.length <= 44) return "";

  const { RealtimeClient } = await import("@speechmatics/real-time-client");
  const { createSpeechmaticsJWT } = await import("@speechmatics/auth");

  const client = new RealtimeClient();
  let finalText = "";

  return withTimeout(
    (async () => {
      const done = new Promise<void>((resolve, reject) => {
        client.addEventListener("receiveMessage", ({ data }) => {
          if (data.message === "AddTranscript") {
            const piece = (data.metadata?.transcript ?? "").trim();
            if (piece) finalText += (finalText && !finalText.endsWith(" ") ? " " : "") + piece;
          } else if (data.message === "EndOfTranscript") {
            resolve();
          } else if (data.message === "Error") {
            reject(new Error(`Speechmatics error: ${data.reason ?? data.type ?? "unknown"}`));
          }
        });
      });

      const jwt = await createSpeechmaticsJWT({
        type: "rt",
        apiKey: config.speechmaticsApiKey,
        ttl: 120,
      });

      await client.start(jwt, {
        transcription_config: {
          language: "en",
          model: "enhanced",
          enable_partials: false,
        },
        audio_format: { type: "file" },
      });

      const CHUNK = 4096;
      for (let offset = 0; offset < wav.length; offset += CHUNK) {
        client.sendAudio(wav.subarray(offset, offset + CHUNK));
      }
      await client.stopRecognition({ noTimeout: true });
      await done;
      return finalText.trim();
    })(),
    BAKE_OFF_TIMEOUT_MS,
    "Speechmatics",
  );
}

/** Safe fire-and-forget wrapper — logs warnings, never throws. */
export async function safeBakeOffTranscribe(
  provider: "aai" | "sm",
  wav: Buffer,
): Promise<string | null> {
  try {
    const transcript =
      provider === "aai"
        ? await speechToTextAssemblyAi(Buffer.from(wav))
        : await speechToTextSpeechmatics(Buffer.from(wav));
    return transcript;
  } catch (err) {
    logger.warn(
      {
        provider,
        err: err instanceof Error ? err.message : String(err),
      },
      `[fire-dispatch] STT bake-off ${provider.toUpperCase()} failed — Deepgram path unaffected`,
    );
    return null;
  }
}

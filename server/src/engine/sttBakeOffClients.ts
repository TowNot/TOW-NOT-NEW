/**
 * Parallel STT bake-off helpers for AssemblyAI + Speechmatics.
 * Failures here must never throw into the Deepgram fire-dispatch path,
 * and must never leave WebSocket 'error' events unhandled (Railway crash).
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

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return String(err);
}

/** Known transient WS / network messages that must not kill the process. */
export function isTransientNetworkError(err: unknown): boolean {
  const message = errorMessage(err).toLowerCase();
  return (
    message.includes("websocket was closed before the connection was established") ||
    message.includes("socket is not open") ||
    message.includes("socket not ready") ||
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("etimedout") ||
    message.includes("epipe") ||
    message.includes("socket hang up") ||
    message.includes("network socket disconnected") ||
    message.includes("aborted")
  );
}

function withBakeOffTimeout<T>(
  run: (ctx: {
    isCancelled: () => boolean;
    onCancel: (fn: () => void) => void;
  }) => Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let cancelled = false;
  const cancelHooks: Array<() => void> = [];

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      cancelled = true;
      for (const hook of cancelHooks) {
        try {
          hook();
        } catch {
          /* ignore */
        }
      }
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);

    void run({
      isCancelled: () => cancelled,
      onCancel: (fn) => {
        cancelHooks.push(fn);
      },
    }).then(
      (value) => {
        clearTimeout(timer);
        if (!cancelled) resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        if (!cancelled) reject(err);
        else {
          logger.debug(
            { label, err: errorMessage(err) },
            "[stt-bake-off] late failure after timeout (ignored)",
          );
        }
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

  const { AssemblyAI } = await import("assemblyai");
  const client = new AssemblyAI({ apiKey: config.assemblyAiApiKey });
  const transcriber = client.streaming.transcriber({
    speechModel: "universal-3-5-pro",
    sampleRate: 16_000,
    formatTurns: true,
  });

  let lastFinal = "";
  let lastPartial = "";

  const safeClose = async (): Promise<void> => {
    try {
      const raw = transcriber as unknown as {
        socket?: {
          readyState: number;
          OPEN: number;
          CONNECTING: number;
          on?: (event: string, fn: (...args: unknown[]) => void) => void;
        };
      };
      const socket = raw.socket;
      if (!socket) return;

      // SDK close() removes listeners then calls socket.close(). Doing that
      // while CONNECTING emits "WebSocket was closed before the connection
      // was established" with no handler → uncaughtException.
      if (socket.readyState === socket.CONNECTING) {
        socket.on?.("error", () => undefined);
        logger.debug("[stt-bake-off] AssemblyAI skip close while CONNECTING");
        return;
      }

      if (socket.readyState !== socket.OPEN) return;

      await Promise.race([
        transcriber.close(false),
        new Promise<void>((r) => setTimeout(r, 500)),
      ]);
    } catch (err) {
      logger.debug(
        { err: errorMessage(err) },
        "[stt-bake-off] AssemblyAI close ignored",
      );
    }
  };

  return withBakeOffTimeout(
    async ({ isCancelled, onCancel }) => {
      onCancel(() => {
        void safeClose();
      });

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
        transcriber.on("error", (err) => {
          logger.warn(
            { err: errorMessage(err) },
            "[stt-bake-off] AssemblyAI WebSocket error",
          );
          settle(() => reject(err instanceof Error ? err : new Error(errorMessage(err))));
        });
        transcriber.on("close", () => {
          logger.debug("[stt-bake-off] AssemblyAI WebSocket closed");
          settle(() => resolve());
        });

        void (async () => {
          try {
            await transcriber.connect();
            if (isCancelled()) {
              await safeClose();
              settle(() => resolve());
              return;
            }

            for (let offset = 0; offset < pcm.length; offset += PCM_CHUNK_BYTES) {
              if (isCancelled() || settled) break;
              const chunk = pcm.subarray(offset, offset + PCM_CHUNK_BYTES);
              const copy = chunk.buffer.slice(
                chunk.byteOffset,
                chunk.byteOffset + chunk.byteLength,
              );
              try {
                transcriber.sendAudio(copy);
              } catch (err) {
                logger.debug(
                  { err: errorMessage(err) },
                  "[stt-bake-off] AssemblyAI sendAudio skipped (socket not open)",
                );
                break;
              }
            }

            if (!isCancelled() && !settled) {
              try {
                transcriber.forceEndpoint();
              } catch {
                /* optional mid-stream flush */
              }
              await new Promise((r) => setTimeout(r, 400));
            }

            await safeClose();
            settle(() => resolve());
          } catch (err) {
            await safeClose();
            settle(() => reject(err instanceof Error ? err : new Error(errorMessage(err))));
          }
        })();
      });

      if (isCancelled()) return "";
      return (lastFinal || lastPartial).trim();
    },
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

  const safeStop = (): void => {
    try {
      // Never call close while CONNECTING — that is exactly the fatal ws error.
      if (client.socketState === "open") {
        try {
          void client.stopRecognition({ noTimeout: true });
        } catch {
          /* ignore */
        }
        const raw = client as unknown as {
          socket?: { readyState: number; OPEN: number; close: () => void };
        };
        if (raw.socket && raw.socket.readyState === raw.socket.OPEN) {
          raw.socket.close();
        }
      }
    } catch (err) {
      logger.debug(
        { err: errorMessage(err) },
        "[stt-bake-off] Speechmatics stop ignored",
      );
    }
  };

  return withBakeOffTimeout(
    async ({ isCancelled, onCancel }) => {
      onCancel(() => {
        safeStop();
      });

      const done = new Promise<void>((resolve, reject) => {
        client.addEventListener("receiveMessage", (({ data }: {
          data: {
            message?: string;
            metadata?: { transcript?: string };
            reason?: string;
            type?: string;
          };
        }) => {
          if (data.message === "AddTranscript") {
            const piece = (data.metadata?.transcript ?? "").trim();
            if (piece) {
              finalText += (finalText && !finalText.endsWith(" ") ? " " : "") + piece;
            }
          } else if (data.message === "EndOfTranscript") {
            resolve();
          } else if (data.message === "Error") {
            reject(
              new Error(`Speechmatics error: ${data.reason ?? data.type ?? "unknown"}`),
            );
          }
        }) as never);

        client.addEventListener("socketStateChange", ((event: { socketState?: string }) => {
          const state = event.socketState;
          logger.debug({ state }, "[stt-bake-off] Speechmatics socket state");
          if (state === "closed") {
            resolve();
          }
        }) as never);
      });

      try {
        const jwt = await createSpeechmaticsJWT({
          type: "rt",
          apiKey: config.speechmaticsApiKey,
          ttl: 120,
        });

        if (isCancelled()) return "";

        await client.start(jwt, {
          transcription_config: {
            language: "en",
            model: "enhanced",
            enable_partials: false,
          },
          audio_format: { type: "file" },
        });

        if (isCancelled()) {
          safeStop();
          return "";
        }

        const CHUNK = 4096;
        for (let offset = 0; offset < wav.length; offset += CHUNK) {
          if (isCancelled()) break;
          if (client.socketState !== "open") {
            logger.debug(
              { state: client.socketState },
              "[stt-bake-off] Speechmatics sendAudio skipped (socket not open)",
            );
            break;
          }
          try {
            client.sendAudio(wav.subarray(offset, offset + CHUNK));
          } catch (err) {
            logger.debug(
              { err: errorMessage(err) },
              "[stt-bake-off] Speechmatics sendAudio failed",
            );
            break;
          }
        }

        if (!isCancelled() && client.socketState === "open") {
          try {
            await client.stopRecognition({ noTimeout: true });
          } catch (err) {
            logger.debug(
              { err: errorMessage(err) },
              "[stt-bake-off] Speechmatics stopRecognition failed",
            );
          }
          await Promise.race([
            done,
            new Promise<void>((r) => setTimeout(r, 2_000)),
          ]);
        }

        return finalText.trim();
      } catch (err) {
        safeStop();
        throw err instanceof Error ? err : new Error(errorMessage(err));
      }
    },
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
        err: errorMessage(err),
        transient: isTransientNetworkError(err),
      },
      `[fire-dispatch] STT bake-off ${provider.toUpperCase()} failed — Deepgram path unaffected`,
    );
    return null;
  }
}

import { config } from "../config";
import { keepAliveFetch } from "./httpFetch";
import { STT_RETRY_POLICY, withTransientRetry } from "./retryPolicy";

/** Minimal surface used by the dry-run script. Live STT uses fetch, not the SDK. */
type DeepgramSdkClient = {
  listen?: {
    v1?: {
      connect: (opts: Record<string, unknown>) => Promise<{
        connect: () => void;
        waitForOpen: () => Promise<void>;
        sendCloseStream: (msg: { type: string }) => void;
        close: () => void;
      }>;
    };
  };
};

let client: DeepgramSdkClient | null = null;

/**
 * Prerecorded Listen is the right API for a closed WAV chunk: a 10s dispatch
 * buffer transcribes in ~1-2s. The live WebSocket path was hanging until our
 * 20s timer, then retrying three times (~61s) and discarding the audio.
 */
const REQUEST_TIMEOUT_MS = 8_000;
const SDK_MAX_RETRIES = 0;

const DISPATCH_KEYTERMS = [
  "MVC",
  "MVA",
  "motor vehicle collision",
  "London Fire",
  "765",
  "tractor trailer",
  "light pole",
  "pole down",
  "wires down",
  "hit the pole",
  "vehicle fire",
  "car fire",
  "truck fire",
  "auto fire",
];

export function getDeepgram(): DeepgramSdkClient {
  if (!config.deepgramApiKey) {
    throw new Error("DEEPGRAM_API_KEY is not configured");
  }
  if (!client) {
    // Lazy require: a static import of @deepgram/sdk stalls `tsc` for 15+ min
    // even with skipLibCheck, which is why Railway image builds timed out.
    const { DeepgramClient } = require("@deepgram/sdk") as {
      DeepgramClient: new (opts: Record<string, unknown>) => DeepgramSdkClient;
    };
    client = new DeepgramClient({
      apiKey: config.deepgramApiKey,
      timeoutInSeconds: Math.ceil(REQUEST_TIMEOUT_MS / 1000),
      maxRetries: SDK_MAX_RETRIES,
      reconnect: false,
    });
  }
  return client;
}

export type Transcriber = (wav: Buffer) => Promise<string>;

function transcriptFromResponse(response: unknown): string {
  const results = (response as {
    results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string }> }> };
  })?.results;
  return results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? "";
}

/**
 * POST a closed WAV to Deepgram Listen ourselves. The SDK's transcribeFile
 * always sends `duplex: "half"` plus a manual Content-Length; recent undici
 * rejects that with UND_ERR_INVALID_ARG ("invalid content-length header")
 * in 2-3ms and the fire listener discards the buffer. A Blob body lets
 * fetch set length; we never add Content-Length ourselves.
 */
async function transcribeOnce(wav: Buffer): Promise<string> {
  if (!config.deepgramApiKey) {
    throw new Error("DEEPGRAM_API_KEY is not configured");
  }
  const params = new URLSearchParams({
    model: "nova-3",
    language: "en-US",
    smart_format: "true",
    punctuate: "true",
    numerals: "true",
  });
  for (const term of DISPATCH_KEYTERMS) params.append("keyterm", term);

  // Copy off the Buffer pool so Blob/undici cannot see extra pooled bytes.
  const body = new Blob([Uint8Array.from(wav)], { type: "audio/wav" });
  const response = await keepAliveFetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${config.deepgramApiKey}`,
      Accept: "application/json",
    },
    body,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw Object.assign(
      new Error(`Deepgram listen failed (${response.status}): ${detail.slice(0, 200)}`),
      { status: response.status },
    );
  }
  return transcriptFromResponse(await response.json());
}

export async function speechToText(
  wav: Buffer,
  transcribe: Transcriber = transcribeOnce,
): Promise<string> {
  return withTransientRetry(STT_RETRY_POLICY, () => transcribe(wav));
}

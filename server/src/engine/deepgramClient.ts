import { DeepgramClient } from "@deepgram/sdk";
import { config } from "../config";
import { STT_RETRY_POLICY, withTransientRetry } from "./retryPolicy";

let client: DeepgramClient | null = null;

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
];

export function getDeepgram(): DeepgramClient {
  if (!config.deepgramApiKey) {
    throw new Error("DEEPGRAM_API_KEY is not configured");
  }
  if (!client) {
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
 * Send one WAV buffer to Deepgram Nova-3 prerecorded Listen. Rebuilt per
 * attempt so a retry never reuses a consumed body.
 */
async function transcribeOnce(wav: Buffer): Promise<string> {
  const response = await getDeepgram().listen.v1.media.transcribeFile(
    new Uint8Array(wav),
    {
      model: "nova-3",
      language: "en-US",
      smart_format: true,
      punctuate: true,
      numerals: true,
      keyterm: DISPATCH_KEYTERMS,
    },
    {
      timeoutInSeconds: Math.ceil(REQUEST_TIMEOUT_MS / 1000),
      maxRetries: SDK_MAX_RETRIES,
    },
  );
  return transcriptFromResponse(response);
}

export async function speechToText(
  wav: Buffer,
  transcribe: Transcriber = transcribeOnce,
): Promise<string> {
  return withTransientRetry(STT_RETRY_POLICY, () => transcribe(wav));
}

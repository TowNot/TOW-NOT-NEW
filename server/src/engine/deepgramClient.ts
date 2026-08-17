import { DeepgramClient } from "@deepgram/sdk";
import { config } from "../config";
import { STT_RETRY_POLICY, withTransientRetry } from "./retryPolicy";

let client: DeepgramClient | null = null;

/**
 * Bound the live socket so a hung Deepgram session cannot stall the fire
 * listener's single-flight audio processor. SDK reconnect is off: our
 * STT_RETRY_POLICY is the only retry layer.
 */
const LIVE_TIMEOUT_MS = 20_000;
const SDK_MAX_RETRIES = 1;

const DISPATCH_KEYTERMS = [
  "MVC",
  "MVA",
  "motor vehicle collision",
  "London Fire",
  "765",
];

export function getDeepgram(): DeepgramClient {
  if (!config.deepgramApiKey) {
    throw new Error("DEEPGRAM_API_KEY is not configured");
  }
  if (!client) {
    client = new DeepgramClient({
      apiKey: config.deepgramApiKey,
      timeoutInSeconds: Math.ceil(LIVE_TIMEOUT_MS / 1000),
      maxRetries: SDK_MAX_RETRIES,
      reconnect: false,
    });
  }
  return client;
}

export type Transcriber = (wav: Buffer) => Promise<string>;

function toMediaBytes(wav: Buffer): Uint8Array {
  return new Uint8Array(wav.buffer, wav.byteOffset, wav.byteLength);
}

/**
 * Stream one WAV buffer over Deepgram Listen v1 (Nova-3) and collect finals.
 * A new socket is opened per attempt so a retry never reuses a half-closed
 * connection or a body the failed request already consumed.
 */
async function transcribeOnce(wav: Buffer): Promise<string> {
  const connection = await getDeepgram().listen.v1.connect({
    model: "nova-3",
    language: "en-US",
    smart_format: "true",
    punctuate: "true",
    numerals: "true",
    interim_results: "false",
    keyterm: DISPATCH_KEYTERMS,
    reconnectAttempts: 0,
    connectionTimeoutInSeconds: Math.ceil(LIVE_TIMEOUT_MS / 1000),
  });

  const finals: string[] = [];

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        connection.close();
      } catch {
        // Socket may already be closed by Deepgram after CloseStream.
      }
      fn();
    };

    const timer = setTimeout(() => {
      settle(() =>
        reject(
          Object.assign(new Error("Deepgram live transcription timed out"), {
            code: "ETIMEDOUT",
          }),
        ),
      );
    }, LIVE_TIMEOUT_MS);

    connection.on("message", (data) => {
      if (data.type !== "Results") return;
      const text = data.channel?.alternatives?.[0]?.transcript?.trim() ?? "";
      if (text && data.is_final !== false) finals.push(text);
    });

    connection.on("error", (err) => {
      settle(() => reject(err));
    });

    connection.on("close", () => {
      settle(() => resolve(finals.join(" ").replace(/\s+/g, " ").trim()));
    });

    void (async () => {
      try {
        connection.connect();
        await connection.waitForOpen();
        connection.sendMedia(toMediaBytes(wav));
        connection.sendCloseStream({ type: "CloseStream" });
      } catch (err) {
        settle(() => reject(err));
      }
    })();
  });
}

export async function speechToText(
  wav: Buffer,
  transcribe: Transcriber = transcribeOnce,
): Promise<string> {
  return withTransientRetry(STT_RETRY_POLICY, () => transcribe(wav));
}

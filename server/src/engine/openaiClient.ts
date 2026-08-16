import { toFile } from "openai";
import OpenAI from "openai";
import { config } from "../config";
import { logger } from "./pinoCompat";

let client: OpenAI | null = null;

/**
 * The SDK defaults to a 10-minute timeout with 2 retries, so one hung socket
 * can hold the listener's single-flight audio processor for far longer than a
 * buffer window. Bounding an HTTP attempt to 20s with one built-in retry keeps
 * the SDK's share of a call under ~40s; `withOpenAIRetry` layers the outer
 * jittered attempts on top and caps the total wall clock.
 */
const REQUEST_TIMEOUT_MS = 20_000;
const SDK_MAX_RETRIES = 1;

export function getOpenAI(): OpenAI {
  if (!config.openaiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  if (!client) {
    client = new OpenAI({
      apiKey: config.openaiApiKey,
      baseURL: config.openaiBaseUrl || undefined,
      timeout: REQUEST_TIMEOUT_MS,
      maxRetries: SDK_MAX_RETRIES,
    });
  }
  return client;
}

/* ------------------------------------------------------------------ */
/* Transient-failure retries                                          */
/* ------------------------------------------------------------------ */

/** Transport-level failures that a repeat attempt can plausibly survive. */
const RETRYABLE_ERROR_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "EPIPE",
  "ECONNREFUSED",
  "ECONNABORTED",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EAI_AGAIN",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
]);

const RETRYABLE_MESSAGE_RE = /socket hang up|premature close|network error|timed? ?out/i;

/** undici/node-fetch bury the real errno one or more `cause` hops down. */
function errorCode(err: unknown): string | null {
  let current: unknown = err;
  for (let depth = 0; current && depth < 5; depth++) {
    const node = current as { code?: unknown; errno?: unknown; cause?: unknown };
    if (typeof node.code === "string") return node.code;
    if (typeof node.errno === "string") return node.errno;
    current = node.cause;
  }
  return null;
}

function errorStatus(err: unknown): number | null {
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : null;
}

function errorMessage(err: unknown): string {
  const parts: string[] = [];
  let current: unknown = err;
  for (let depth = 0; current && depth < 5; depth++) {
    const node = current as { message?: unknown; cause?: unknown };
    if (typeof node.message === "string" && node.message.length > 0) {
      parts.push(node.message);
    }
    current = node.cause;
  }
  return parts.join(" | ").slice(0, 300);
}

/**
 * Rate limits, request timeouts and server faults clear on their own; 400 is a
 * malformed request and 401/403 are credential problems, so repeating those
 * only burns the pipeline's time budget and quota.
 */
export function isRetryableOpenAIError(err: unknown): boolean {
  const status = errorStatus(err);
  if (status !== null) {
    return status === 408 || status === 409 || status === 429 || status >= 500;
  }
  const code = errorCode(err);
  if (code && RETRYABLE_ERROR_CODES.has(code)) return true;
  return RETRYABLE_MESSAGE_RE.test(errorMessage(err));
}

export interface RetryPolicy {
  /** Operation name used in retry/failure logs. */
  label: string;
  maxAttempts: number;
  /** No further attempt starts once this much wall clock has elapsed. */
  budgetMs: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

/**
 * Worst case ≈ 2 attempts × ~40s of SDK time + backoff ≈ 85s: the budget stops
 * a third attempt from starting once two have already burned their timeouts,
 * while a fast-failing reset still gets all three attempts within a few
 * seconds. Anything longer would stall the audio buffer behind the
 * single-flight guard and start shedding live dispatch traffic.
 */
export const STT_RETRY_POLICY: RetryPolicy = {
  label: "speech-to-text",
  maxAttempts: 3,
  budgetMs: 60_000,
  baseDelayMs: 500,
  maxDelayMs: 4_000,
};

/** Tighter than STT: this runs after a crash keyword already matched, and the
 * transcript is posted with fallback coordinates if it never resolves. */
export const LOCATION_RETRY_POLICY: RetryPolicy = {
  label: "location-extraction",
  maxAttempts: 3,
  budgetMs: 25_000,
  baseDelayMs: 400,
  maxDelayMs: 2_000,
};

export interface RetryHooks {
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exponential backoff with full jitter on the upper half of each window. */
function backoffDelayMs(policy: RetryPolicy, attempt: number): number {
  const window = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (attempt - 1));
  return Math.round(window / 2 + Math.random() * (window / 2));
}

export async function withOpenAIRetry<T>(
  policy: RetryPolicy,
  run: () => Promise<T>,
  hooks: RetryHooks = {},
): Promise<T> {
  const sleep = hooks.sleep ?? defaultSleep;
  const now = hooks.now ?? Date.now;
  const startedAt = now();
  let lastError: unknown;

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    try {
      return await run();
    } catch (err) {
      lastError = err;
      const code = errorCode(err);
      const status = errorStatus(err);
      const elapsedMs = now() - startedAt;
      const retryable = isRetryableOpenAIError(err);
      const exhausted = attempt >= policy.maxAttempts || elapsedMs >= policy.budgetMs;

      if (!retryable || exhausted) {
        logger.error(
          {
            op: policy.label,
            attempt,
            code,
            status,
            elapsedMs,
            retryable,
            message: errorMessage(err),
          },
          `[openai] ${policy.label} failed after ${attempt} attempt(s) — ${
            retryable ? "retry budget exhausted" : "error is not retryable"
          }`,
        );
        throw err;
      }

      const delayMs = backoffDelayMs(policy, attempt);
      logger.warn(
        {
          op: policy.label,
          attempt,
          maxAttempts: policy.maxAttempts,
          code,
          status,
          delayMs,
          elapsedMs,
          message: errorMessage(err),
        },
        `[openai] ${policy.label} attempt ${attempt}/${policy.maxAttempts} failed (${
          code ?? status ?? "unknown"
        }) — retrying in ${delayMs}ms`,
      );
      await sleep(delayMs);
    }
  }

  throw lastError;
}

/* ------------------------------------------------------------------ */
/* Calls                                                              */
/* ------------------------------------------------------------------ */

export type Transcriber = (wav: Buffer) => Promise<string>;

async function transcribeOnce(wav: Buffer): Promise<string> {
  // Rebuilt per attempt so a retry never re-sends a body the failed request
  // already consumed.
  const file = await toFile(wav, "dispatch.wav", { type: "audio/wav" });
  const result = await getOpenAI().audio.transcriptions.create({
    file,
    model: "whisper-1",
  });
  return result.text;
}

export async function speechToText(
  wav: Buffer,
  transcribe: Transcriber = transcribeOnce,
): Promise<string> {
  return withOpenAIRetry(STT_RETRY_POLICY, () => transcribe(wav));
}

export async function extractJsonLocation(transcript: string): Promise<string | null> {
  const response = await withOpenAIRetry(LOCATION_RETRY_POLICY, () =>
    getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 200,
      messages: [
        {
          role: "system",
          content:
            "You extract street locations from London Fire Department (London, Ontario, Canada) radio dispatch transcripts. " +
            "Transcripts come in two forms: automated Station Alerting announcements, and live radio traffic where " +
            '"765" (Dispatch) calls apparatus (e.g. "765 calling Engine 3", "Pumper 1, transfer to Tac 1", ' +
            '"Engine 3 responding to Wharncliffe and Oxford"). ' +
            "IGNORE unit identifiers (Engine/Pumper/Rescue/Ladder/Truck/Aerial/Car + number, \"765\", \"Dispatch\") and " +
            'channel assignments ("Tac 1", "Tac 2", "channel") — they are NEVER locations. ' +
            'Radio static garbles words: "MVC" may appear as "NBC" or "M.V.C." — these all mean a motor vehicle collision. ' +
            'Reply with ONLY a JSON object: {"location": "<street address or CROSS-STREET intersection>"} ' +
            'using the clearest location mentioned (e.g. {"location": "Wharncliffe Road and Oxford Street"}). ' +
            'If no street, intersection, or address is mentioned, reply {"location": null}.',
        },
        { role: "user", content: transcript },
      ],
    }),
  );
  const raw = response.choices[0]?.message?.content ?? "";
  try {
    const jsonText = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    const parsed = JSON.parse(jsonText) as { location?: string | null };
    return typeof parsed.location === "string" && parsed.location.trim().length > 0
      ? parsed.location.trim()
      : null;
  } catch {
    return null;
  }
}

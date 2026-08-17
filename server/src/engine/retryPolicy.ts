import { logger } from "./pinoCompat";

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
  const node = err as { status?: unknown; statusCode?: unknown } | null;
  if (typeof node?.status === "number") return node.status;
  if (typeof node?.statusCode === "number") return node.statusCode;
  return null;
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
export function isRetryableTransientError(err: unknown): boolean {
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
 * Each Deepgram prerecorded attempt is capped at 8s. Three attempts plus
 * jittered backoff stay under ~20s — short enough that the fire listener's
 * single-flight guard does not shed the next live dispatch buffer.
 */
export const STT_RETRY_POLICY: RetryPolicy = {
  label: "speech-to-text",
  maxAttempts: 3,
  budgetMs: 20_000,
  baseDelayMs: 400,
  maxDelayMs: 1_500,
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

export async function withTransientRetry<T>(
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
      const retryable = isRetryableTransientError(err);
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
          `[${policy.label}] failed after ${attempt} attempt(s) — ${
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
        `[${policy.label}] attempt ${attempt}/${policy.maxAttempts} failed (${
          code ?? status ?? "unknown"
        }) — retrying in ${delayMs}ms`,
      );
      await sleep(delayMs);
    }
  }

  throw lastError;
}

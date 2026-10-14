/**
 * Broadcastify signed-in session for HLS fire radio.
 *
 * Broadcastify no longer publishes a static playlist URL: the player POSTs to
 * `/listen/session/?feedId=N` and gets back a per-client signed playlist URL,
 * which is refused (401) unless the request carries a logged-in account cookie.
 * A free account is enough.
 *
 * All HTTP goes through `curl` (same as the HLS listener — Broadcastify blocks
 * Node's fetch fingerprint). The password is passed on stdin, never argv.
 */
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { config } from "../../config";
import { logger } from "../../logger";

const ORIGIN = "https://www.broadcastify.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36";
const COOKIE_JAR = path.join(os.tmpdir(), `broadcastify-cookies-${process.pid}.txt`);
export const BROADCASTIFY_COOKIE_JAR = COOKIE_JAR;
const CURL_TIMEOUT_MS = 30_000;
/** Re-login proactively; Broadcastify sessions outlive this comfortably. */
const LOGIN_MAX_AGE_MS = 6 * 60 * 60 * 1000;
/** After a failed login, don't hammer the login form. */
const LOGIN_RETRY_BACKOFF_MS = 5 * 60 * 1000;
const HTTP_MARKER = "\n__HTTP_STATUS__";

interface CurlResult {
  status: number;
  body: string;
  redirectUrl: string;
}

function runCurl(args: string[], stdin?: string): Promise<CurlResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn("curl", [
      "-sS",
      "--max-time",
      "20",
      "--connect-timeout",
      "10",
      "-A",
      UA,
      "-b",
      COOKIE_JAR,
      "-c",
      COOKIE_JAR,
      "-w",
      `${HTTP_MARKER}%{http_code} %{redirect_url}`,
      ...args,
    ]);
    const out: Buffer[] = [];
    const errOut: Buffer[] = [];
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(killer);
      fn();
    };
    const killer = setTimeout(() => {
      proc.kill("SIGKILL");
      settle(() => reject(new Error("curl timed out (hard kill)")));
    }, CURL_TIMEOUT_MS);
    proc.stdout.on("data", (d: Buffer) => {
      if (out.length < 256) out.push(d);
    });
    proc.stderr.on("data", (d: Buffer) => {
      if (errOut.length < 32) errOut.push(d);
    });
    proc.on("error", (err) => settle(() => reject(err)));
    proc.on("close", (code) => {
      settle(() => {
        const text = Buffer.concat(out).toString("utf8");
        const idx = text.lastIndexOf(HTTP_MARKER);
        if (code !== 0 || idx < 0) {
          reject(
            new Error(`curl exited ${code}: ${Buffer.concat(errOut).toString().slice(0, 200)}`),
          );
          return;
        }
        const [status = "", redirectUrl = ""] = text.slice(idx + HTTP_MARKER.length).split(" ");
        resolve({
          status: Number(status) || 0,
          body: text.slice(0, idx),
          redirectUrl: redirectUrl.trim(),
        });
      });
    });
    if (stdin !== undefined) proc.stdin.end(stdin);
    else proc.stdin.end();
  });
}

export function hasBroadcastifyCredentials(): boolean {
  return Boolean(config.broadcastifyUsername && config.broadcastifyPassword);
}

let loggedInAt = 0;
let lastLoginFailureAt = 0;
let loginInFlight: Promise<boolean> | null = null;

async function login(): Promise<boolean> {
  if (!hasBroadcastifyCredentials()) return false;
  if (lastLoginFailureAt && Date.now() - lastLoginFailureAt < LOGIN_RETRY_BACKOFF_MS) {
    return false;
  }
  if (loginInFlight) return loginInFlight;
  loginInFlight = (async () => {
    try {
      const res = await runCurl(
        [
          "-X",
          "POST",
          "-H",
          `Origin: ${ORIGIN}`,
          "-H",
          `Referer: ${ORIGIN}/login/`,
          "--data-urlencode",
          `username=${config.broadcastifyUsername}`,
          "--data-urlencode",
          "password@-",
          "--data-urlencode",
          "action=auth",
          "--data-urlencode",
          "redirect=/",
          `${ORIGIN}/login/`,
        ],
        config.broadcastifyPassword,
      );
      if (res.status >= 500 || res.status === 0) {
        throw new Error(`login HTTP ${res.status}`);
      }
      if (/[?&]failed=/.test(res.redirectUrl)) {
        lastLoginFailureAt = Date.now();
        logger.error(
          "[broadcastify] sign-in rejected — check BROADCASTIFY_USERNAME / BROADCASTIFY_PASSWORD on Railway",
        );
        return false;
      }
      loggedInAt = Date.now();
      lastLoginFailureAt = 0;
      logger.info("[broadcastify] signed in", { httpStatus: res.status });
      return true;
    } catch (err) {
      lastLoginFailureAt = Date.now();
      logger.warn("[broadcastify] sign-in request failed", { err });
      return false;
    } finally {
      loginInFlight = null;
    }
  })();
  return loginInFlight;
}

async function requestSessionUrl(feedId: number): Promise<CurlResult> {
  const referer = `${ORIGIN}/listen/feed/popout.php?feedId=${feedId}`;
  return runCurl([
    "-X",
    "POST",
    "-H",
    `Origin: ${ORIGIN}`,
    "-H",
    `Referer: ${referer}`,
    `${ORIGIN}/listen/session/?feedId=${feedId}`,
  ]);
}

function parseSessionUrl(body: string): { url: string; keys: string[] } | null {
  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    const url = json.url;
    return typeof url === "string" && url.startsWith("https://")
      ? { url, keys: Object.keys(json) }
      : null;
  } catch {
    return null;
  }
}

/**
 * Mint a fresh signed HLS playlist URL for a Broadcastify feed.
 * Signs in (or re-signs in on 401) as needed. Returns null on failure.
 */
export async function mintBroadcastifyHlsUrl(feedId: number): Promise<string | null> {
  if (!hasBroadcastifyCredentials()) {
    logger.error(
      "[broadcastify] BROADCASTIFY_USERNAME / BROADCASTIFY_PASSWORD not set — fire radio needs a signed-in account",
    );
    return null;
  }
  try {
    if (!loggedInAt || Date.now() - loggedInAt > LOGIN_MAX_AGE_MS) {
      if (!(await login())) return null;
    }

    let res = await requestSessionUrl(feedId);
    if (res.status === 401 || res.status === 403) {
      loggedInAt = 0;
      if (!(await login())) return null;
      res = await requestSessionUrl(feedId);
    }

    const session = res.status === 200 ? parseSessionUrl(res.body) : null;
    if (!session) {
      if (res.status === 401 || res.status === 403) {
        lastLoginFailureAt = Date.now();
        logger.error(
          "[broadcastify] still not authorized after sign-in — check BROADCASTIFY_USERNAME / BROADCASTIFY_PASSWORD",
          { feedId, httpStatus: res.status },
        );
      } else {
        logger.warn("[broadcastify] session endpoint returned no stream URL", {
          feedId,
          httpStatus: res.status,
          body: res.body.slice(0, 120),
        });
      }
      return null;
    }

    const minted = new URL(session.url);
    logger.info(
      `[broadcastify] minted HLS stream URL ${minted.host}${minted.pathname.replace(
        /\/t\/[^/]+\//,
        "/t/<token>/",
      )} (query params: ${
        [...minted.searchParams.keys()].join(",") || "none"
      }; response fields: ${session.keys.join(",")})`,
      { feedId },
    );
    return session.url;
  } catch (err) {
    logger.warn("[broadcastify] session request failed", { err, feedId });
    return null;
  }
}

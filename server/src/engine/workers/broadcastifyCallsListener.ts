import { spawn } from "node:child_process";
import { config } from "../../config";
import { logger } from "../../logger";
import type { ZoneCallsAudioSource } from "../zones.config";
import { createFireDispatchProcessor } from "./fireDispatchPipeline";

const POLL_INTERVAL_MS = 3_000;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface LiveCallRow {
  ts?: number;
  timestamp?: number;
  path?: string;
  url?: string;
  talkgroup?: number;
  tg?: number;
  talkgroupId?: number;
}

function callTimestamp(row: LiveCallRow): number {
  return Number(row.ts ?? row.timestamp ?? 0);
}

function callTalkgroup(row: LiveCallRow): number | null {
  const tg = row.talkgroup ?? row.tg ?? row.talkgroupId;
  return typeof tg === "number" && Number.isFinite(tg) ? tg : null;
}

function callAudioUrl(row: LiveCallRow): string | null {
  if (row.url && /^https?:\/\//i.test(row.url)) return row.url;
  if (row.path) {
    const path = row.path.startsWith("/") ? row.path : `/${row.path}`;
    return `${config.broadcastifyCallsAudioBase.replace(/\/$/, "")}${path}`;
  }
  return null;
}

async function fetchLiveCalls(
  nodeId: number,
  pos: number,
): Promise<{ calls: LiveCallRow[]; pos: number }> {
  const apiKey = config.broadcastifyCallsApiKey.trim();
  if (!apiKey) {
    throw new Error("BROADCASTIFY_CALLS_API_KEY is not configured");
  }

  const base = config.broadcastifyCallsApiBase.replace(/\/$/, "");
  const url = `${base}/calls/v1/live/node/${nodeId}?pos=${pos}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "User-Agent": UA,
    },
    signal: AbortSignal.timeout(12_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Broadcastify Calls live fetch ${res.status}: ${body.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    calls?: LiveCallRow[];
    liveCalls?: LiveCallRow[];
    pos?: number;
    position?: number;
  };

  const calls = json.calls ?? json.liveCalls ?? [];
  const nextPos = Number(json.pos ?? json.position ?? pos);
  return { calls, pos: Number.isFinite(nextPos) ? nextPos : pos };
}

function downloadCallAudio(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-user_agent",
      UA,
      "-i",
      url,
      "-ac",
      "1",
      "-ar",
      "16000",
      "-f",
      "wav",
      "pipe:1",
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
      ff.kill("SIGKILL");
      settle(() => reject(new Error("call audio download timed out")));
    }, 45_000);
    ff.stdout.on("data", (d: Buffer) => out.push(d));
    ff.stderr.on("data", (d: Buffer) => {
      if (errOut.length < 32) errOut.push(d);
    });
    ff.on("error", (err) => settle(() => reject(err)));
    ff.on("close", (code) => {
      settle(() => {
        const wav = Buffer.concat(out);
        if (wav.length > 44 + 8000) resolve(wav);
        else
          reject(
            new Error(
              `call audio ffmpeg exited ${code}: ${Buffer.concat(errOut).toString().slice(0, 200)}`,
            ),
          );
      });
    });
  });
}

/** Poll Broadcastify Calls live API for a node and transcribe each new call. */
export function startBroadcastifyCallsListener(
  zoneId: string,
  source: ZoneCallsAudioSource,
): () => void {
  const processor = createFireDispatchProcessor({
    zoneId,
    sourceType: "calls",
    label: source.description,
  });

  if (!config.broadcastifyCallsApiKey.trim()) {
    logger.warn(
      `[fire-dispatch] calls listener skipped for ${source.description} — BROADCASTIFY_CALLS_API_KEY unset`,
    );
    return () => undefined;
  }

  let stopped = false;
  let pos = 0;
  const seenTs = new Set<number>();
  const talkgroupFilter =
    source.talkgroups && source.talkgroups.length > 0
      ? new Set(source.talkgroups)
      : null;

  const tick = async (): Promise<void> => {
    const { calls, pos: nextPos } = await fetchLiveCalls(source.nodeId, pos);
    pos = nextPos;

    for (const call of calls) {
      const ts = callTimestamp(call);
      if (!ts || seenTs.has(ts)) continue;
      seenTs.add(ts);
      if (seenTs.size > 500) {
        const oldest = [...seenTs].slice(0, 100);
        oldest.forEach((v) => seenTs.delete(v));
      }

      const tg = callTalkgroup(call);
      if (talkgroupFilter && tg !== null && !talkgroupFilter.has(tg)) continue;

      const audioUrl = callAudioUrl(call);
      if (!audioUrl) {
        logger.debug(
          "[fire-dispatch] calls row missing audio URL — skipped",
          { nodeId: source.nodeId, ts, tg },
        );
        continue;
      }

      try {
        const wav = await downloadCallAudio(audioUrl);
        await processor.processWav(wav);
      } catch (err) {
        logger.warn("[fire-dispatch] calls audio processing failed", {
          err,
          nodeId: source.nodeId,
          ts,
          tg,
          audioUrl,
        });
      }
    }
  };

  logger.info(
    `[fire-dispatch] calls listener started: ${source.description} (node ${source.nodeId})`,
  );

  const timer = setInterval(() => {
    if (stopped) return;
    void tick().catch((err) => {
      logger.warn("[fire-dispatch] calls poll failed — will retry", {
        err,
        nodeId: source.nodeId,
      });
    });
  }, POLL_INTERVAL_MS);
  timer.unref();

  void tick().catch((err) =>
    logger.warn("[fire-dispatch] initial calls poll failed", {
      err,
      nodeId: source.nodeId,
    }),
  );

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

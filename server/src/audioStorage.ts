import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import { logger } from "./logger";

/** Writable directory served at GET /audio/*.wav */
export function resolveAudioRoot(): string {
  const candidates = [
    path.join(__dirname, "public/audio"),
    path.join(process.cwd(), "server/dist/public/audio"),
    path.join(process.cwd(), "dist/public/audio"),
  ];
  for (const dir of candidates) {
    const parent = path.dirname(dir);
    if (existsSync(parent)) return dir;
  }
  return candidates[0]!;
}

export function ensureAudioDir(): string {
  const dir = resolveAudioRoot();
  mkdirSync(dir, { recursive: true });
  return dir;
}

export async function saveFireDispatchAudio(
  wav: Buffer,
  incidentId: string,
): Promise<string> {
  const dir = ensureAudioDir();
  pruneExpiredAudio(dir);
  const safe = incidentId.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 80);
  const filename = `${safe}-${Date.now()}.wav`;
  await writeFile(path.join(dir, filename), wav);
  return `/audio/${filename}`;
}

function pruneExpiredAudio(dir: string): void {
  const cutoff = Date.now() - config.incidentTtlMs;
  try {
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".wav")) continue;
      const file = path.join(dir, name);
      if (statSync(file).mtimeMs < cutoff) unlinkSync(file);
    }
  } catch (error) {
    logger.debug("Audio prune skipped", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

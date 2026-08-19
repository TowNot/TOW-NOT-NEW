import { existsSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";

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
  const safe = incidentId.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 80);
  const filename = `${safe}-${Date.now()}.wav`;
  await writeFile(path.join(dir, filename), wav);
  return `/audio/${filename}`;
}

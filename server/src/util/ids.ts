import { createHash } from "node:crypto";

export function stableId(source: string, key: string): string {
  return createHash("sha256").update(`${source}:${key}`).digest("hex").slice(0, 16);
}

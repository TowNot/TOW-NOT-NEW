import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { logger } from "../logger";
import { toE164 } from "./e164";

const MAX_SUBSCRIBERS = 50;

function resolveStorePath(): string {
  const dir = path.join(process.cwd(), "data");
  mkdirSync(dir, { recursive: true });
  return path.join(dir, "sms-subscribers.json");
}

function load(): Set<string> {
  const file = resolveStorePath();
  if (!existsSync(file)) return new Set();
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
    const list = Array.isArray(parsed) ? parsed : [];
    return new Set(
      list.filter((n): n is string => typeof n === "string" && /^\+[1-9]\d{9,14}$/.test(n)),
    );
  } catch (error) {
    logger.warn("SMS subscriber file unreadable — starting empty", {
      error: error instanceof Error ? error.message : String(error),
    });
    return new Set();
  }
}

const numbers = load();

function persist(): void {
  try {
    writeFileSync(resolveStorePath(), JSON.stringify([...numbers].sort(), null, 2));
  } catch (error) {
    logger.warn("SMS subscriber persist failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function listSmsSubscribers(): string[] {
  return [...numbers];
}

export function smsSubscriberCount(): number {
  return numbers.size;
}

export function addSmsSubscriber(raw: string): { phone: string; created: boolean } {
  const phone = toE164(raw);
  if (!phone) {
    throw new Error("Enter a valid phone number, e.g. 519-555-1212 or +15195551212");
  }
  if (numbers.has(phone)) return { phone, created: false };
  if (numbers.size >= MAX_SUBSCRIBERS) {
    throw new Error("SMS opt-in list is full");
  }
  numbers.add(phone);
  persist();
  return { phone, created: true };
}

export function removeSmsSubscriber(raw: string): { phone: string; removed: boolean } {
  const phone = toE164(raw);
  if (!phone) {
    throw new Error("Enter a valid phone number, e.g. 519-555-1212 or +15195551212");
  }
  const removed = numbers.delete(phone);
  if (removed) persist();
  return { phone, removed };
}

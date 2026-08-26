/**
 * One-time import from legacy JSON files into PostgreSQL.
 *
 * Usage (from repo root):
 *   DATABASE_URL=postgresql://... npx tsx server/src/scripts/migrateJsonToDb.ts
 */
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import "dotenv/config";
import type { SubscriptionStatus } from "@prisma/client";
import { connectPrisma, disconnectPrisma, prisma } from "../db/prisma";
import { logger } from "../logger";

interface LegacySubscriptionFile {
  byEmail?: Record<
    string,
    {
      email: string;
      status: SubscriptionStatus;
      stripeCustomerId?: string | null;
      stripeSubscriptionId?: string | null;
      clientReferenceId?: string | null;
      createdAt?: string;
      updatedAt?: string;
    }
  >;
}

function dataDir(): string {
  return path.join(process.cwd(), "data");
}

function subscriptionsPath(): string {
  return path.join(dataDir(), "subscriptions.json");
}

function smsSubscribersPath(): string {
  return path.join(dataDir(), "sms-subscribers.json");
}

function readSubscriptions(): LegacySubscriptionFile["byEmail"] {
  const file = subscriptionsPath();
  if (!existsSync(file)) return {};
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as LegacySubscriptionFile;
    return parsed.byEmail && typeof parsed.byEmail === "object" ? parsed.byEmail : {};
  } catch (error) {
    logger.warn("Could not read subscriptions.json", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {};
  }
}

function readSmsPhones(): string[] {
  const file = smsSubscribersPath();
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
    const list = Array.isArray(parsed) ? parsed : [];
    return list.filter(
      (n): n is string => typeof n === "string" && /^\+[1-9]\d{9,14}$/.test(n),
    );
  } catch (error) {
    logger.warn("Could not read sms-subscribers.json", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

async function migrateSubscriptions(): Promise<number> {
  const rows = Object.values(readSubscriptions() ?? {});
  let migrated = 0;
  for (const row of rows) {
    const email = row.email?.trim().toLowerCase();
    if (!email) continue;
    await prisma.subscription.upsert({
      where: { email },
      create: {
        email,
        status: row.status ?? "inactive",
        stripeCustomerId: row.stripeCustomerId?.trim() || null,
        stripeSubscriptionId: row.stripeSubscriptionId?.trim() || null,
        clientReferenceId: row.clientReferenceId?.trim() || null,
        createdAt: row.createdAt ? new Date(row.createdAt) : undefined,
        updatedAt: row.updatedAt ? new Date(row.updatedAt) : undefined,
      },
      update: {
        status: row.status ?? "inactive",
        stripeCustomerId: row.stripeCustomerId?.trim() || null,
        stripeSubscriptionId: row.stripeSubscriptionId?.trim() || null,
        clientReferenceId: row.clientReferenceId?.trim() || null,
        updatedAt: row.updatedAt ? new Date(row.updatedAt) : undefined,
      },
    });
    migrated += 1;
  }
  return migrated;
}

async function migrateSmsSubscribers(): Promise<number> {
  const phones = readSmsPhones();
  let migrated = 0;
  for (const phone of phones) {
    await prisma.smsSubscriber.upsert({
      where: { phone },
      create: { phone, active: true },
      update: { active: true },
    });
    migrated += 1;
  }
  return migrated;
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is required");
  }

  mkdirSync(dataDir(), { recursive: true });
  await connectPrisma();

  const subs = await migrateSubscriptions();
  const sms = await migrateSmsSubscribers();

  logger.info("JSON → Postgres migration complete", {
    subscriptions: subs,
    smsSubscribers: sms,
    subscriptionsFile: existsSync(subscriptionsPath()),
    smsFile: existsSync(smsSubscribersPath()),
  });
}

void main()
  .catch((error: unknown) => {
    logger.error("JSON → Postgres migration failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });

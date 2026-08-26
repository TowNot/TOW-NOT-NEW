import { prisma } from "../db/prisma";
import { logger } from "../logger";
import { toE164 } from "./e164";

const MAX_SUBSCRIBERS = 50;

/** Active E.164 numbers — refreshed from Postgres on miss / after writes. */
let activePhonesCache: string[] | null = null;

async function refreshActivePhonesCache(): Promise<string[]> {
  const rows = await prisma.smsSubscriber.findMany({
    where: { active: true },
    select: { phone: true },
    orderBy: { phone: "asc" },
  });
  activePhonesCache = rows.map((row) => row.phone);
  return activePhonesCache;
}

function invalidateSmsCache(): void {
  activePhonesCache = null;
}

export async function warmSmsSubscriberCache(): Promise<void> {
  try {
    const count = (await refreshActivePhonesCache()).length;
    logger.info("SMS subscriber cache warmed", { count });
  } catch (error) {
    logger.warn("SMS subscriber cache warm skipped", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function listSmsSubscribers(): Promise<string[]> {
  if (activePhonesCache) return [...activePhonesCache];
  return [...(await refreshActivePhonesCache())];
}

export async function smsSubscriberCount(): Promise<number> {
  if (activePhonesCache) return activePhonesCache.length;
  return prisma.smsSubscriber.count({ where: { active: true } });
}

export async function addSmsSubscriber(
  raw: string,
  zoneId?: string | null,
): Promise<{ phone: string; created: boolean }> {
  const phone = toE164(raw);
  if (!phone) {
    throw new Error("Enter a valid phone number, e.g. 519-555-1212 or +15195551212");
  }

  const existing = await prisma.smsSubscriber.findUnique({ where: { phone } });
  if (existing?.active) {
    return { phone, created: false };
  }

  const activeCount = await prisma.smsSubscriber.count({ where: { active: true } });
  if (!existing && activeCount >= MAX_SUBSCRIBERS) {
    throw new Error("SMS opt-in list is full");
  }

  await prisma.smsSubscriber.upsert({
    where: { phone },
    create: {
      phone,
      active: true,
      zoneId: zoneId?.trim() || null,
    },
    update: {
      active: true,
      ...(zoneId?.trim() ? { zoneId: zoneId.trim() } : {}),
    },
  });

  invalidateSmsCache();
  return { phone, created: !existing?.active };
}

export async function removeSmsSubscriber(
  raw: string,
): Promise<{ phone: string; removed: boolean }> {
  const phone = toE164(raw);
  if (!phone) {
    throw new Error("Enter a valid phone number, e.g. 519-555-1212 or +15195551212");
  }

  const existing = await prisma.smsSubscriber.findUnique({ where: { phone } });
  if (!existing?.active) {
    return { phone, removed: false };
  }

  await prisma.smsSubscriber.update({
    where: { phone },
    data: { active: false },
  });

  invalidateSmsCache();
  return { phone, removed: true };
}

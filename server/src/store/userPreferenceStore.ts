import { prisma } from "../db/prisma";
import { invalidateActiveMonitoredCitiesCache, normalizeCityId } from "../engine/activeMonitoredCities";
import { logger } from "../logger";

const DEFAULT_CITY = "london";

export interface UserCityRecord {
  clerkUserId: string;
  selectedCity: string;
  notificationsEnabled: boolean;
  updatedAt: string;
}

function toRecord(row: {
  clerkUserId: string;
  selectedCity: string;
  notificationsEnabled: boolean;
  updatedAt: Date;
}): UserCityRecord {
  return {
    clerkUserId: row.clerkUserId,
    selectedCity: row.selectedCity,
    notificationsEnabled: row.notificationsEnabled,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getUserSelectedCity(clerkUserId: string): Promise<string> {
  const id = clerkUserId.trim();
  if (!id) return DEFAULT_CITY;
  try {
    const row = await prisma.userPreference.findUnique({ where: { clerkUserId: id } });
    if (!row) return DEFAULT_CITY;
    return normalizeCityId(row.selectedCity) ?? DEFAULT_CITY;
  } catch (error) {
    logger.warn("Failed to read user selected city — defaulting to London", {
      clerkUserId: id,
      error: error instanceof Error ? error.message : String(error),
    });
    return DEFAULT_CITY;
  }
}

export async function upsertUserSelectedCity(
  clerkUserId: string,
  selectedCity: string,
): Promise<UserCityRecord> {
  const id = clerkUserId.trim();
  const city = normalizeCityId(selectedCity);
  if (!id || !city) {
    throw new Error("Invalid user or city");
  }

  const row = await prisma.userPreference.upsert({
    where: { clerkUserId: id },
    create: {
      clerkUserId: id,
      selectedCity: city,
      notificationsEnabled: true,
    },
    update: { selectedCity: city },
  });

  invalidateActiveMonitoredCitiesCache();
  return toRecord(row);
}

export async function updateSubscriptionSelectedCity(
  email: string,
  selectedCity: string,
): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const city = normalizeCityId(selectedCity);
  if (!normalizedEmail || !city) return;

  await prisma.subscription.updateMany({
    where: { email: normalizedEmail },
    data: { selectedCity: city },
  });
  invalidateActiveMonitoredCitiesCache();
}

export async function updateSmsSubscriberSelectedCity(
  phone: string,
  selectedCity: string,
): Promise<void> {
  const city = normalizeCityId(selectedCity);
  if (!phone.trim() || !city) return;

  await prisma.smsSubscriber.updateMany({
    where: { phone: phone.trim(), active: true },
    data: { selectedCity: city },
  });
  invalidateActiveMonitoredCitiesCache();
}
